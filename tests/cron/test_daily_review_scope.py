"""Tests for BP-91 daily-review scope and coverage-marker handling."""

from datetime import datetime
from unittest.mock import patch

import pytest

import cron.scheduler as scheduler


DAILY_REVIEW_PROMPT = "/sieu-tro-ly-ra-soat-hang-ngay"
COMPLETE = "B1_REVIEW_COVERAGE_COMPLETE"
INCOMPLETE = "B1_REVIEW_COVERAGE_INCOMPLETE"


def _b1_job(**overrides):
    job = {
        "id": "daily-review-job",
        "prompt": DAILY_REVIEW_PROMPT,
        "last_run_at": None,
        "last_status": None,
    }
    job.update(overrides)
    return job


class TestDailyReviewScope:
    def test_first_run_without_previous_state_is_baseline(self):
        scope = scheduler._build_b1_review_scope(_b1_job(), previous_marker=None)

        assert scope["mode"] == "baseline"
        assert scope["previous_success_at"] == "none"
        assert scope["last_active_after"] == "none"
        assert scope["lookback_days"] == 7

    def test_successful_complete_run_is_incremental_with_unix_lower_bound(self):
        previous = "2026-09-19T12:00:00+00:00"
        scope = scheduler._build_b1_review_scope(
            _b1_job(last_run_at=previous, last_status="ok"),
            previous_marker=COMPLETE,
        )

        expected = int(datetime.fromisoformat(previous).timestamp()) - 7 * 86400
        assert scope["mode"] == "incremental"
        assert scope["previous_success_at"] == previous
        assert scope["last_active_after"] == expected
        assert scope["lookback_days"] == 7

    @pytest.mark.parametrize("marker", [None, INCOMPLETE, "B1_REVIEW_COVERAGE_UNKNOWN"])
    def test_missing_or_non_complete_marker_keeps_baseline(self, marker):
        scope = scheduler._build_b1_review_scope(
            _b1_job(
                last_run_at="2026-09-19T12:00:00+00:00",
                last_status="ok",
            ),
            previous_marker=marker,
        )

        assert scope["mode"] == "baseline"
        assert scope["last_active_after"] == "none"

    def test_previous_failure_keeps_baseline_even_with_complete_marker(self):
        scope = scheduler._build_b1_review_scope(
            _b1_job(
                last_run_at="2026-09-19T12:00:00+00:00",
                last_status="error",
            ),
            previous_marker=COMPLETE,
        )

        assert scope["mode"] == "baseline"

    def test_scope_is_injected_only_for_exact_daily_review_prompt(self):
        scope = scheduler._build_b1_review_scope(_b1_job(), previous_marker=None)
        b1_prompt = scheduler._build_job_prompt(
            _b1_job(), review_scope=scope,
        )
        ordinary_prompt = scheduler._build_job_prompt(
            {"prompt": "do ordinary cron work"}, review_scope=scope,
        )

        assert "## Review scope (system-generated)" in b1_prompt
        assert "mode: baseline" in b1_prompt
        assert "## Review scope (system-generated)" not in ordinary_prompt

    def test_preclaim_snapshot_survives_current_dispatch_mutation(self):
        job = _b1_job(
            last_run_at="2026-09-19T12:00:00+00:00",
            last_status="ok",
        )
        captured = scheduler._capture_b1_review_scope(
            job,
            previous_marker=COMPLETE,
        )
        job["last_run_at"] = "2026-09-20T12:00:00+00:00"
        job["last_status"] = "running"

        prompt = scheduler._build_job_prompt(job, review_scope=captured)

        assert "mode: incremental" in prompt
        assert "previous_success_at: 2026-09-19T12:00:00+00:00" in prompt
        assert "2026-09-20T12:00:00+00:00" not in prompt

    def test_run_body_passes_preclaim_snapshot_after_claim_mutates_job(self):
        job = _b1_job(
            execution_id="execution-1",
            last_run_at="2026-09-19T12:00:00+00:00",
            last_status="ok",
        )
        captured = {}

        def claim_and_mutate(_job_id):
            job["last_run_at"] = "2026-09-20T12:00:00+00:00"
            job["last_status"] = "running"
            return True

        def fake_run_job(_job, **kwargs):
            captured.update(kwargs)
            return True, "# saved", "B1_REVIEW_COVERAGE_COMPLETE\nReport", None

        with patch.object(scheduler, "_read_latest_b1_coverage_marker", return_value=COMPLETE), \
             patch.object(scheduler, "claim_dispatch", side_effect=claim_and_mutate), \
             patch.object(scheduler, "mark_execution_running"), \
             patch.object(scheduler, "run_job", side_effect=fake_run_job), \
             patch.object(scheduler, "save_job_output", return_value="output.md"), \
             patch.object(scheduler, "_deliver_result"), \
             patch.object(scheduler, "mark_job_run"), \
             patch.object(scheduler, "finish_execution"), \
             patch("agent.secret_scope.build_profile_secret_scope", return_value={}), \
             patch("agent.secret_scope.set_secret_scope", return_value=object()), \
             patch("agent.secret_scope.reset_secret_scope"):
            assert scheduler._run_one_job_body(job) is True

        assert captured["review_scope"]["mode"] == "incremental"
        assert captured["review_scope"]["previous_success_at"] == (
            "2026-09-19T12:00:00+00:00"
        )


class TestDailyReviewSavedOutput:
    def test_latest_saved_output_marker_is_read_from_existing_cron_output(self, tmp_path):
        output_dir = tmp_path / "output" / "daily-review-job"
        output_dir.mkdir(parents=True)
        (output_dir / "2026-09-19_12-00-00.md").write_text(
            f"{COMPLETE}\n# Cron Job: review\n", encoding="utf-8",
        )

        with patch.object(scheduler, "get_cron_output_dir", return_value=tmp_path / "output"):
            marker = scheduler._read_latest_b1_coverage_marker("daily-review-job")

        assert marker == COMPLETE

    @pytest.mark.parametrize(
        ("response", "expected_marker", "expected_body"),
        [
            (f"{COMPLETE}\n\n{scheduler.SILENT_MARKER}", COMPLETE, scheduler.SILENT_MARKER),
            (f"{INCOMPLETE}\n\nCoverage missing page 2", INCOMPLETE, "Coverage missing page 2"),
            ("Coverage missing marker", None, "Coverage missing marker"),
        ],
    )
    def test_valid_coverage_marker_is_stripped_before_delivery(self, response, expected_marker, expected_body):
        marker, body = scheduler._split_b1_coverage_marker(response)

        assert marker == expected_marker
        assert body == expected_body

    def test_complete_marker_does_not_break_silent_suppression_after_stripping(self):
        marker, body = scheduler._split_b1_coverage_marker(
            f"{COMPLETE}\n{scheduler.SILENT_MARKER}"
        )

        assert marker == COMPLETE
        assert scheduler._is_cron_silence_response(body) is True

    @pytest.mark.parametrize(
        "response",
        [
            f"{INCOMPLETE}\n{scheduler.SILENT_MARKER}",
            scheduler.SILENT_MARKER,
            "B1_REVIEW_COVERAGE_UNKNOWN\n[SILENT]",
        ],
    )
    def test_incomplete_or_unknown_coverage_can_never_be_silent(self, response):
        marker, body = scheduler._normalize_b1_response(_b1_job(), response)

        assert marker in {None, INCOMPLETE}
        assert body != scheduler.SILENT_MARKER
        assert "not suppressed" in body

    def test_empty_incomplete_marker_gets_visible_limitation_report(self):
        marker, body = scheduler._normalize_b1_response(_b1_job(), INCOMPLETE)

        assert marker == INCOMPLETE
        assert body
        assert body != scheduler.SILENT_MARKER
        assert "not suppressed" in body
