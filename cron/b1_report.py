"""Persist clean B1 daily-review reports without changing cron audit output."""

from __future__ import annotations

import contextvars
import json
import ntpath
import os
import re
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Mapping, Optional

from hermes_constants import get_hermes_home


B1_REVIEW_COVERAGE_COMPLETE = "B1_REVIEW_COVERAGE_COMPLETE"
B1_REVIEW_COVERAGE_INCOMPLETE = "B1_REVIEW_COVERAGE_INCOMPLETE"
SILENT_MARKER = "[SILENT]"
REPORT_TYPE = "b1-review"
_REPORT_NAME = "b1-review"
_SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_RESERVED_DEVICE_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
_ACTIVE_TELEMETRY: contextvars.ContextVar[Optional["B1ReviewTelemetry"]] = (
    contextvars.ContextVar("b1_review_telemetry", default=None)
)


@dataclass
class B1ReviewTelemetry:
    """Read-only counters collected only while one B1 run is active."""

    browse_totals: list[int] = field(default_factory=list)
    listed_session_ids: set[str] = field(default_factory=set)
    read_session_ids: set[str] = field(default_factory=set)
    failed_session_ids: set[str] = field(default_factory=set)
    read_failure_attempts: int = 0
    errors: list[str] = field(default_factory=list)


def active_b1_review_telemetry() -> Optional[B1ReviewTelemetry]:
    """Return the current context-local telemetry, if this is a B1 run."""
    return _ACTIVE_TELEMETRY.get()


@contextmanager
def capture_b1_review(
    job_id: str,
    run_id: str,
    review_scope: Optional[Mapping[str, object]],
) -> Iterator[B1ReviewTelemetry]:
    """Install per-run telemetry and always restore the prior context."""
    telemetry = B1ReviewTelemetry()
    token = _ACTIVE_TELEMETRY.set(telemetry)
    try:
        yield telemetry
    finally:
        _ACTIVE_TELEMETRY.reset(token)


def record_session_search_result(
    *, mode: str, requested_session_id: Optional[str], result_text: str,
) -> None:
    """Record counters from an existing session_search JSON response.

    This function deliberately does not alter or wrap the response returned to
    the caller. It is a no-op for ordinary jobs because the context variable is
    unset outside the B1 scheduler scope.
    """
    telemetry = active_b1_review_telemetry()
    if telemetry is None:
        return
    try:
        payload = json.loads(result_text)
    except (TypeError, ValueError) as exc:
        telemetry.errors.append(f"session_search returned invalid JSON: {exc}")
        if requested_session_id:
            telemetry.read_failure_attempts += 1
            telemetry.failed_session_ids.add(str(requested_session_id))
        return

    if not isinstance(payload, dict):
        telemetry.errors.append("session_search returned a non-object JSON value")
        return

    actual_mode = str(payload.get("mode") or mode or "unknown").strip().lower()
    success = bool(payload.get("success"))
    if actual_mode == "browse" and success:
        total = payload.get("total")
        if isinstance(total, bool):
            total = None
        try:
            if total is not None:
                telemetry.browse_totals.append(int(total))
        except (TypeError, ValueError):
            telemetry.errors.append(f"session_search browse total is invalid: {total!r}")
        for result in payload.get("results") or []:
            if isinstance(result, dict) and result.get("session_id"):
                telemetry.listed_session_ids.add(str(result["session_id"]))
        return

    if actual_mode == "read" and success:
        session_id = payload.get("session_id") or requested_session_id
        if session_id:
            telemetry.read_session_ids.add(str(session_id))
        return

    if not success:
        if actual_mode == "read":
            telemetry.read_failure_attempts += 1
        session_id = requested_session_id or payload.get("session_id")
        if session_id:
            telemetry.failed_session_ids.add(str(session_id))
        error = payload.get("error") or payload.get("message") or "unknown error"
        telemetry.errors.append(f"session_search {actual_mode} failed: {error}")


def sanitize_report_component(value: str, *, field: str) -> str:
    """Validate a single filename component and reject traversal/device names."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError(f"unsafe {field}: whitespace or empty value")
    if value in {".", ".."} or not _SAFE_COMPONENT.fullmatch(value):
        raise ValueError(f"unsafe {field}: {value!r}")
    if any(char in value for char in ("/", "\\", "\x00")):
        raise ValueError(f"unsafe {field}: path separator")
    if ntpath.isabs(value) or ntpath.splitdrive(value)[0]:
        raise ValueError(f"unsafe {field}: absolute or drive path")
    if value.split(".", 1)[0].upper() in _RESERVED_DEVICE_NAMES:
        raise ValueError(f"unsafe {field}: reserved Windows device name")
    return value


def utc_report_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S-%fZ")


def _coverage_marker(raw_output: str) -> str:
    for line in str(raw_output or "").splitlines():
        marker = line.strip()
        if marker:
            if marker == B1_REVIEW_COVERAGE_COMPLETE:
                return "COMPLETE"
            if marker == B1_REVIEW_COVERAGE_INCOMPLETE:
                return "INCOMPLETE"
            return "INCOMPLETE"
    return "INCOMPLETE"


def _count_text(value: Optional[int]) -> str:
    return str(value) if value is not None else "unknown"


def _render_report(
    *, job_id: str, run_id: str, raw_output: str, final_response: str,
    review_scope: Optional[Mapping[str, object]], telemetry: Optional[B1ReviewTelemetry],
) -> str:
    coverage = _coverage_marker(raw_output)
    scope_total = max(telemetry.browse_totals) if telemetry and telemetry.browse_totals else None
    listed = len(telemetry.listed_session_ids) if telemetry else None
    read = len(telemetry.read_session_ids) if telemetry else None
    unverified = (
        max(scope_total - read, 0)
        if scope_total is not None and read is not None
        else None
    )
    unresolved_failed_ids = None
    if telemetry is not None:
        unresolved_failed_ids = telemetry.failed_session_ids - telemetry.read_session_ids
        if telemetry.listed_session_ids:
            unresolved_failed_ids &= telemetry.listed_session_ids
    unresolved_failed = (
        len(unresolved_failed_ids)
        if unresolved_failed_ids is not None
        else None
    )
    mode = str((review_scope or {}).get("mode") or "unknown")
    if mode not in {"baseline", "incremental"}:
        mode = "unknown"

    body = str(final_response or "").strip()
    for token in (
        B1_REVIEW_COVERAGE_COMPLETE,
        B1_REVIEW_COVERAGE_INCOMPLETE,
        SILENT_MARKER,
    ):
        body = body.replace(token, "")
    body = body.strip()
    if not body:
        body = (
            "Coverage completed; no user-facing summary was delivered."
            if coverage == "COMPLETE"
            else "The run did not produce a user-facing summary."
        )

    lines = [
        "# Báo cáo rà soát hằng ngày",
        "",
        "## Metadata",
        "",
        f"- Thời điểm (UTC): `{utc_report_timestamp()}`",
        f"- Job ID: `{job_id}`",
        f"- Run ID: `{run_id}`",
        f"- Chế độ: `{mode}`",
        f"- Coverage: `{coverage}`",
        f"- Số session trong phạm vi: `{_count_text(scope_total)}`",
        f"- Số session đã liệt kê: `{_count_text(listed)}`",
        f"- Số session đã đọc: `{_count_text(read)}`",
        f"- Số session chưa đọc/không xác minh: `{_count_text(unverified)}`",
        f"- Lượt đọc lỗi (đã thử lại): `{_count_text(telemetry.read_failure_attempts if telemetry else None)}`",
        f"- Session có lỗi đọc chưa giải quyết: `{_count_text(unresolved_failed)}`",
        "",
    ]
    if coverage == "COMPLETE" and unverified is not None and unverified > 0:
        lines.extend([
            (
                "CẢNH BÁO: marker COMPLETE mâu thuẫn với telemetry — "
                f"đã đọc {read}/{scope_total} session, còn {unverified} session "
                "chưa đọc/không xác minh."
            ),
            "",
        ])
    if coverage == "INCOMPLETE" or (coverage == "COMPLETE" and unverified is not None and unverified > 0):
        lines.extend([
            "## Phần chưa quét",
            "",
            (
                f"Số session chưa đọc/không xác minh: `{_count_text(unverified)}`."
                if unverified is not None
                else "Không đủ telemetry để xác minh số session chưa đọc/không xác minh; giữ là `unknown`."
            ),
            "",
        ])
        if telemetry and telemetry.errors:
            lines.extend(["Chi tiết lỗi: " + "; ".join(telemetry.errors), ""])
    lines.extend([body, ""])

    rendered = "\n".join(lines)
    for token in (
        B1_REVIEW_COVERAGE_COMPLETE,
        B1_REVIEW_COVERAGE_INCOMPLETE,
        SILENT_MARKER,
    ):
        if token in rendered:
            raise ValueError(f"internal marker leaked into B1 report: {token}")
    return rendered


def _atomic_write_no_overwrite(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".b1-report-", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        if path.exists():
            raise FileExistsError(f"B1 report already exists: {path}")
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def save_b1_report(
    *, job_id: str, run_id: str, raw_output: str, final_response: str,
    review_scope: Optional[Mapping[str, object]], telemetry: Optional[B1ReviewTelemetry] = None,
) -> Path:
    """Write one clean report below the active profile's report-type folder."""
    safe_job_id = sanitize_report_component(str(job_id), field="job_id")
    safe_run_id = sanitize_report_component(str(run_id), field="run_id")
    home = Path(get_hermes_home()).resolve()
    report_dir = (home / "reports" / REPORT_TYPE).resolve()
    try:
        report_dir.relative_to(home)
    except ValueError as exc:
        raise ValueError("B1 report directory escaped active HERMES_HOME") from exc
    filename = f"{_REPORT_NAME}__{utc_report_timestamp()}__job-{safe_job_id}__run-{safe_run_id}.md"
    path = report_dir / filename
    rendered = _render_report(
        job_id=safe_job_id,
        run_id=safe_run_id,
        raw_output=raw_output,
        final_response=final_response,
        review_scope=review_scope,
        telemetry=telemetry,
    )
    _atomic_write_no_overwrite(path, rendered)
    return path
