"""Read-only, profile-scoped summaries of the local Hermes Dashboard data."""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from tools.registry import registry, tool_error, tool_result


_SECRET_PATTERN = re.compile(
    r"\b(?:sk|pk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b",
    re.IGNORECASE,
)
_PREVIEW_MAX_CHARS = 120


def _resolve_profile_db(profile: Optional[str]):
    """Open the requested profile's state DB read-only."""
    from hermes_cli import profiles as profiles_mod
    from hermes_state import SessionDB

    if profile and str(profile).strip():
        canonical = profiles_mod.normalize_profile_name(str(profile).strip())
        profiles_mod.validate_profile_name(canonical)
        if not profiles_mod.profile_exists(canonical):
            raise ValueError(f"profile '{canonical}' does not exist")
        home = profiles_mod.get_profile_dir(canonical)
        return canonical, SessionDB(db_path=Path(home) / "state.db", read_only=True)

    try:
        from hermes_cli.profiles import get_active_profile_name

        active = get_active_profile_name()
    except Exception:
        active = "default"
    return active or "default", SessionDB(read_only=True)


def _local_day_bounds(now: float):
    current = datetime.fromtimestamp(now)
    today = current.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    return yesterday.timestamp(), today.timestamp(), tomorrow.timestamp()


def _safe_preview(value: Any) -> Optional[str]:
    if not isinstance(value, str) or not value:
        return value if value is None else None
    cleaned = _SECRET_PATTERN.sub("[redacted]", value)
    return cleaned[:_PREVIEW_MAX_CHARS]


def _read_sessions(db, start: float, end: float, now: float) -> list[dict]:
    rows = db._conn.execute(
        """
        SELECT s.id, s.title, s.started_at, s.ended_at, s.last_activity_at,
               (SELECT m.content FROM messages m
                  WHERE m.session_id = s.id AND m.role = 'user'
                  ORDER BY m.id LIMIT 1) AS preview
          FROM sessions s
         WHERE s.started_at >= ? AND s.started_at < ? AND s.archived = 0
         ORDER BY s.started_at ASC, s.id ASC
        """,
        (start, end),
    ).fetchall()

    result = []
    for row in rows:
        last_active = row["last_activity_at"] or row["started_at"]
        result.append(
            {
                "id": row["id"],
                "title": row["title"],
                "preview": _safe_preview(row["preview"]),
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "is_active": (
                    row["ended_at"] is None
                    and isinstance(last_active, (int, float))
                    and now - last_active < 300
                ),
            }
        )
    return result


def _today_cost(db, start: float, end: float):
    row = db._conn.execute(
        """
        SELECT COUNT(*) AS total_rows,
               COUNT(estimated_cost_usd) AS present_rows,
               SUM(estimated_cost_usd) AS estimated_cost
          FROM sessions
         WHERE started_at >= ? AND started_at < ? AND archived = 0
        """,
        (start, end),
    ).fetchone()
    if not row["total_rows"] or row["present_rows"] != row["total_rows"]:
        return None
    return float(row["estimated_cost"] or 0.0)


def _today_top_skills(db, start: float, end: float) -> list[dict]:
    counts = Counter()
    rows = db._conn.execute(
        """
        SELECT m.tool_calls
          FROM messages m
          JOIN sessions s ON s.id = m.session_id
         WHERE s.started_at >= ? AND s.started_at < ?
           AND s.archived = 0
           AND m.role = 'assistant' AND m.tool_calls IS NOT NULL
        """,
        (start, end),
    ).fetchall()
    for row in rows:
        try:
            calls = json.loads(row["tool_calls"]) if isinstance(row["tool_calls"], str) else row["tool_calls"]
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(calls, list):
            continue
        for call in calls:
            if not isinstance(call, dict):
                continue
            function = call.get("function")
            if not isinstance(function, dict) or function.get("name") not in {"skill_view", "skill_manage"}:
                continue
            args = function.get("arguments")
            try:
                args = json.loads(args) if isinstance(args, str) else args
            except (TypeError, json.JSONDecodeError):
                continue
            name = args.get("name") if isinstance(args, dict) else None
            if isinstance(name, str) and name.strip():
                counts[name.strip()] += 1
    return [{"name": name, "uses": uses} for name, uses in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def dashboard_summary(
    profile: Optional[str] = None,
    *,
    now: Optional[float] = None,
) -> str:
    """Return yesterday/today Dashboard metadata without transcript contents."""
    observed_at = time.time() if now is None else float(now)
    yesterday_start, today_start, tomorrow_start = _local_day_bounds(observed_at)
    missing: list[str] = []

    try:
        profile_name, db = _resolve_profile_db(profile)
        try:
            yesterday_sessions = _read_sessions(db, yesterday_start, today_start, observed_at)
            today_sessions = _read_sessions(db, today_start, tomorrow_start, observed_at)
            for bucket, sessions in (("yesterday", yesterday_sessions), ("today", today_sessions)):
                for index, session in enumerate(sessions):
                    if session["title"] is None:
                        missing.append(f"{bucket}.sessions[{index}].title")
                    if session["preview"] is None:
                        missing.append(f"{bucket}.sessions[{index}].preview")

            estimated_cost = _today_cost(db, today_start, tomorrow_start)
            if estimated_cost is None:
                missing.append("today.estimatedCost")
            try:
                top_skills = _today_top_skills(db, today_start, tomorrow_start)
            except Exception:
                top_skills = []
                missing.append("today.topSkills")
        finally:
            db.close()
    except Exception as exc:
        return tool_error(f"Dashboard summary unavailable: {exc}", success=False)

    return tool_result(
        success=True,
        profile=profile_name,
        yesterday={"sessions": yesterday_sessions},
        today={
            "sessions": today_sessions,
            "estimatedCost": estimated_cost,
            "topSkills": top_skills,
        },
        missing=missing,
    )


def _check_dashboard_summary_requirements() -> bool:
    try:
        from hermes_state import _default_db_path

        return _default_db_path().parent.exists()
    except Exception:
        return False


DASHBOARD_SUMMARY_SCHEMA = {
    "name": "dashboard_summary",
    "description": (
        "Read the current profile's Dashboard summary from Hermes state.db. "
        "Returns yesterday/today session metadata, today's estimated cost and "
        "top skill usage. Read-only: no transcript dump, credentials, writes, "
        "deletes, approvals, or model/provider changes."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "profile": {
                "type": "string",
                "description": "Optional existing Hermes profile name; defaults to the active profile.",
            }
        },
        "additionalProperties": False,
    },
}


registry.register(
    name="dashboard_summary",
    toolset="session_search",
    schema=DASHBOARD_SUMMARY_SCHEMA,
    handler=lambda args, **_: dashboard_summary(profile=args.get("profile")),
    check_fn=_check_dashboard_summary_requirements,
    emoji="📊",
)
