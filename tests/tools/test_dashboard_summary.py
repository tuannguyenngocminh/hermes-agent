"""RED-first contract tests for the BP-54 dashboard_summary tool."""

import importlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from hermes_state import SessionDB


FIXTURE_PATH = (
    Path(__file__).parents[4]
    / "_evidence"
    / "bp-54"
    / "fixture"
    / "dashboard-snapshot.json"
)


def _load_dashboard_tool():
    """Fail as an assertion until the production tool module is wired."""
    spec = importlib.util.find_spec("tools.dashboard_summary_tool")
    if spec is None:
        pytest.fail("RED: tools.dashboard_summary_tool is not implemented or wired")
    return importlib.import_module("tools.dashboard_summary_tool")


def _epoch(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def _seed_profile(home: Path, snapshot: dict) -> None:
    home.mkdir(parents=True, exist_ok=True)
    db = SessionDB(home / "state.db")
    try:
        for row in snapshot["sessions"]:
            db.create_session(row["id"], source="bp54-fixture")
            db._conn.execute(
                """UPDATE sessions
                   SET started_at = ?, ended_at = ?, title = ?,
                       estimated_cost_usd = ?, input_tokens = ?,
                       output_tokens = ?, api_call_count = ?
                   WHERE id = ?""",
                (
                    _epoch(row["started_at"]),
                    _epoch(row["ended_at"]) if row.get("ended_at") else None,
                    row.get("title"),
                    row.get("estimated_cost_usd"),
                    row.get("input_tokens", 0),
                    row.get("output_tokens", 0),
                    row.get("api_call_count", 0),
                    row["id"],
                ),
            )
            for calls in row.get("tool_calls", []):
                db.append_message(
                    row["id"],
                    role="assistant",
                    content=row.get("sensitive_marker"),
                    tool_calls=[calls],
                )
        db._conn.commit()
    finally:
        db.close()


@pytest.fixture
def fixture_profiles(tmp_path, monkeypatch):
    snapshot = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    for name, profile_snapshot in snapshot["profiles"].items():
        _seed_profile(tmp_path / "profiles" / name, profile_snapshot)
    return snapshot


def test_dashboard_summary_filters_target_profile_and_yesterday_today(fixture_profiles):
    tool = _load_dashboard_tool()
    now = _epoch(fixture_profiles["reference_now"])

    result = json.loads(tool.dashboard_summary(profile="bp54-target", now=now))

    assert result["success"] is True
    assert result["profile"] == "bp54-target"
    assert [row["id"] for row in result["yesterday"]["sessions"]] == [
        "bp54-yesterday-1"
    ]
    assert [row["id"] for row in result["today"]["sessions"]] == [
        "bp54-today-1"
    ]
    assert result["today"]["estimatedCost"] == 0.27
    assert result["today"]["topSkills"] == [{"name": "dashboard-review", "uses": 2}]
    assert "bp54-other-today-1" not in json.dumps(result)


def test_dashboard_summary_never_returns_credential_or_transcript_content(fixture_profiles):
    tool = _load_dashboard_tool()
    now = _epoch(fixture_profiles["reference_now"])

    result = tool.dashboard_summary(profile="bp54-target", now=now)

    assert "sk-bp54-fixture-secret" not in result
    assert "api_key" not in result


def test_dashboard_summary_reports_missing_session_field_instead_of_inventing_it(
    fixture_profiles,
):
    tool = _load_dashboard_tool()
    now = _epoch(fixture_profiles["reference_now"])

    result = json.loads(tool.dashboard_summary(profile="bp54-target", now=now))

    assert result["today"]["sessions"][0]["title"] is None
    assert "today.sessions[0].title" in result["missing"]
