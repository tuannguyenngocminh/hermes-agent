"""Tests for BP-92 B1 report persistence and read-only telemetry."""

import contextvars
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import pytest

from cron import b1_report
import cron.scheduler as scheduler
from hermes_state import SessionDB
from tools.session_search_tool import session_search


COMPLETE = "B1_REVIEW_COVERAGE_COMPLETE"
INCOMPLETE = "B1_REVIEW_COVERAGE_INCOMPLETE"
SILENT = "[SILENT]"


def _telemetry():
    result = b1_report.B1ReviewTelemetry()
    result.browse_totals.extend([47, 47])
    result.listed_session_ids.update({"s-1", "s-2"})
    result.read_session_ids.update({"s-1"})
    return result


def _save(tmp_path, *, raw_output, final_response, telemetry=None, scope=None,
          job_id="daily-review-job", run_id="run-1"):
    with patch.object(b1_report, "get_hermes_home", return_value=tmp_path):
        return b1_report.save_b1_report(
            job_id=job_id,
            run_id=run_id,
            raw_output=raw_output,
            final_response=final_response,
            review_scope=scope or {
                "mode": "baseline",
                "profile_scope": "current cron profile only",
            },
            telemetry=telemetry,
        )


def test_report_writer_uses_profile_report_type_directory_and_metadata(tmp_path):
    path = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\n# raw prompt\n",
        final_response="# Daily review\n\nEverything is covered.",
        telemetry=_telemetry(),
    )

    assert path == tmp_path / "reports" / "b1-review" / path.name
    assert path.suffix == ".md"
    text = path.read_text(encoding="utf-8")
    assert "# Báo cáo rà soát hằng ngày" in text
    assert "## Metadata" in text
    assert "Job ID: `daily-review-job`" in text
    assert "Run ID: `run-1`" in text
    assert "Chế độ: `baseline`" in text
    assert "Coverage: `COMPLETE`" in text
    assert "Số session trong phạm vi: `47`" in text
    assert "Số session đã liệt kê: `2`" in text
    assert "Số session đã đọc: `1`" in text
    assert "Số session chưa đọc/không xác minh: `46`" in text
    assert "Everything is covered." in text


def test_two_runs_create_distinct_files_without_overwrite(tmp_path):
    first = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\nfirst",
        final_response="first",
        job_id="job",
        run_id="run-1",
    )
    second = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\nsecond",
        final_response="second",
        job_id="job",
        run_id="run-2",
    )

    assert first != second
    assert first.read_text(encoding="utf-8") .endswith("first\n")
    assert second.read_text(encoding="utf-8") .endswith("second\n")


def test_report_name_collision_does_not_overwrite(tmp_path, monkeypatch):
    monkeypatch.setattr(b1_report, "get_hermes_home", lambda: tmp_path)
    monkeypatch.setattr(b1_report, "utc_report_timestamp", lambda: "2026-09-20_12-00-00-000000Z")
    first = b1_report.save_b1_report(
        job_id="job", run_id="run", raw_output=f"{COMPLETE}\nfirst",
        final_response="first", review_scope={"mode": "baseline"},
    )
    with pytest.raises(FileExistsError):
        b1_report.save_b1_report(
            job_id="job", run_id="run", raw_output=f"{COMPLETE}\nsecond",
            final_response="second", review_scope={"mode": "baseline"},
        )
    assert first.read_text(encoding="utf-8").endswith("first\n")


@pytest.mark.parametrize("value", [
    "../escape",
    r"..\escape",
    "/absolute",
    r"C:\absolute",
    "con.x",
    "nul.txt",
    "COM1.log",
    "LPT9.report",
    "job\nlog",
])
def test_report_id_sanitizer_rejects_traversal_control_and_reserved_device(value):
    with pytest.raises(ValueError):
        b1_report.sanitize_report_component(value, field="job_id")


def test_renderer_removes_internal_markers_and_silent_token(tmp_path):
    path = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\n{SILENT}\n",
        final_response=SILENT,
    )
    text = path.read_text(encoding="utf-8")
    assert COMPLETE not in text
    assert "B1_REVIEW_COVERAGE_INCOMPLETE" not in text
    assert SILENT not in text


def test_incomplete_report_explains_unscanned_part(tmp_path):
    path = _save(
        tmp_path,
        raw_output=f"{INCOMPLETE}\nreview stopped at offset 20",
        final_response="Coverage is incomplete; stopped at offset 20.",
        telemetry=_telemetry(),
        scope={"mode": "incremental", "profile_scope": "current cron profile only"},
    )
    text = path.read_text(encoding="utf-8")
    assert "Coverage: `INCOMPLETE`" in text
    assert "## Phần chưa quét" in text
    assert "stopped at offset 20" in text
    assert COMPLETE not in text
    assert INCOMPLETE not in text
    assert SILENT not in text


def test_unknown_telemetry_is_explicit_not_inferred(tmp_path):
    path = _save(
        tmp_path,
        raw_output="unknown marker\nbody",
        final_response="body",
    )
    text = path.read_text(encoding="utf-8")
    assert "Coverage: `INCOMPLETE`" in text
    assert "Số session trong phạm vi: `unknown`" in text
    assert "Số session đã liệt kê: `unknown`" in text
    assert "Số session đã đọc: `unknown`" in text
    assert "## Phần chưa quét" in text


def test_session_search_telemetry_records_browse_read_and_error_without_changing_json():
    browse = json.dumps({
        "success": True, "mode": "browse", "total": 3,
        "results": [{"session_id": "s-1"}, {"session_id": "s-2"}],
    })
    read = json.dumps({"success": True, "mode": "read", "session_id": "s-1"})
    error = json.dumps({"success": False, "error": "not found"})

    with b1_report.capture_b1_review("job", "run", {"mode": "baseline"}) as telemetry:
        b1_report.record_session_search_result(
            mode="browse", requested_session_id=None, result_text=browse,
        )
        b1_report.record_session_search_result(
            mode="read", requested_session_id="s-1", result_text=read,
        )
        b1_report.record_session_search_result(
            mode="read", requested_session_id="s-3", result_text=error,
        )

    assert telemetry.browse_totals == [3]
    assert telemetry.listed_session_ids == {"s-1", "s-2"}
    assert telemetry.read_session_ids == {"s-1"}
    assert telemetry.failed_session_ids == {"s-3"}
    assert telemetry.read_failure_attempts == 1
    assert telemetry.errors
    assert json.loads(browse)["results"][0]["session_id"] == "s-1"


def test_failed_read_retried_success_is_not_unresolved_and_out_of_scope_is_excluded(tmp_path):
    with b1_report.capture_b1_review("job", "run", {"mode": "baseline"}) as telemetry:
        telemetry.listed_session_ids.update({"s-1", "s-2"})
        telemetry.browse_totals.append(2)
        b1_report.record_session_search_result(
            mode="read", requested_session_id="s-1",
            result_text=json.dumps({"success": False, "mode": "read", "error": "timeout"}),
        )
        b1_report.record_session_search_result(
            mode="read", requested_session_id="s-1",
            result_text=json.dumps({"success": True, "mode": "read", "session_id": "s-1"}),
        )
        b1_report.record_session_search_result(
            mode="read", requested_session_id="outside-scope",
            result_text=json.dumps({"success": False, "mode": "read", "error": "missing"}),
        )
    path = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\nbody",
        final_response="body",
        telemetry=telemetry,
    )
    text = path.read_text(encoding="utf-8")
    assert "Số session chưa đọc/không xác minh: `1`" in text
    assert "Lượt đọc lỗi (đã thử lại): `2`" in text
    assert "Session có lỗi đọc chưa giải quyết: `0`" in text


def test_complete_marker_with_incomplete_telemetry_emits_warning(tmp_path):
    telemetry = b1_report.B1ReviewTelemetry()
    telemetry.browse_totals.append(3)
    telemetry.listed_session_ids.update({"s-1", "s-2", "s-3"})
    telemetry.read_session_ids.add("s-1")
    path = _save(
        tmp_path,
        raw_output=f"{COMPLETE}\nbody",
        final_response="body",
        telemetry=telemetry,
    )
    text = path.read_text(encoding="utf-8")
    assert "CẢNH BÁO" in text
    assert "marker COMPLETE" in text
    assert "Số session chưa đọc/không xác minh: `2`" in text
    assert "## Phần chưa quét" in text


def test_public_session_search_seam_records_actual_browse_and_read(tmp_path):
    db = SessionDB(tmp_path / "state.db")
    db.create_session("actual-session", source="cli")
    db._conn.commit()
    try:
        with b1_report.capture_b1_review("job", "run", {"mode": "baseline"}) as telemetry:
            browse = json.loads(session_search(db=db, limit=10))
            read = json.loads(session_search(db=db, session_id="actual-session"))
        assert browse["success"] is True
        assert read["success"] is True
        assert telemetry.browse_totals == [1]
        assert telemetry.listed_session_ids == {"actual-session"}
        assert telemetry.read_session_ids == {"actual-session"}
    finally:
        db.close()


def test_context_is_carried_to_agent_executor_and_reset_afterwards():
    assert b1_report.active_b1_review_telemetry() is None

    with b1_report.capture_b1_review("job", "run", {"mode": "baseline"}) as telemetry:
        context = contextvars.copy_context()
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                context.run,
                b1_report.record_session_search_result,
                mode="browse",
                requested_session_id=None,
                result_text=json.dumps({
                    "success": True, "mode": "browse", "total": 1,
                    "results": [{"session_id": "thread-session"}],
                }),
            )
            future.result()
        assert telemetry.listed_session_ids == {"thread-session"}

    assert b1_report.active_b1_review_telemetry() is None


def test_scheduler_b1_scope_is_visible_to_agent_worker_context():
    job = {"id": "daily-review-job", "prompt": "/sieu-tro-ly-ra-soat-hang-ngay"}
    scope = {"mode": "baseline"}
    with scheduler._b1_review_telemetry_scope(job, "execution-1", scope) as telemetry:
        worker_context = contextvars.copy_context()
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(
                worker_context.run,
                b1_report.record_session_search_result,
                mode="browse",
                requested_session_id=None,
                result_text=json.dumps({
                    "success": True, "mode": "browse", "total": 1,
                    "results": [{"session_id": "agent-worker-session"}],
                }),
            ).result()
    assert telemetry.listed_session_ids == {"agent-worker-session"}
    assert b1_report.active_b1_review_telemetry() is None


def test_ordinary_scheduler_job_does_not_open_b1_telemetry():
    with scheduler._b1_review_telemetry_scope(
        {"id": "ordinary", "prompt": "ordinary work"}, "execution-1", None,
    ) as telemetry:
        assert telemetry is None
        assert b1_report.active_b1_review_telemetry() is None


def test_context_resets_after_exception():
    with pytest.raises(RuntimeError):
        with b1_report.capture_b1_review("job", "run", None):
            raise RuntimeError("boom")
    assert b1_report.active_b1_review_telemetry() is None


def test_scheduler_report_persistence_logs_clear_error(caplog):
    telemetry = b1_report.B1ReviewTelemetry()
    with patch.object(scheduler, "save_b1_report", side_effect=OSError("disk full")):
        with pytest.raises(RuntimeError, match="B1 report persistence failed"):
            scheduler._persist_b1_report(
                {"id": "job"}, "run", "raw", "final", {"mode": "baseline"}, telemetry,
            )
    assert "B1 report persistence failed" in caplog.text
    assert "job" in caplog.text
