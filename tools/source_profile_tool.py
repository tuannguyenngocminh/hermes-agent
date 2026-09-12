"""Persist the voluntary onboarding source profile in one fixed location.

This is intentionally separate from Hermes memory.  It accepts only a compact
schema produced by the profile-source conversation and cannot receive a path,
read user files, search, or write any canonical memory target.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from tools.registry import registry, tool_error


PROFILE_FILE = Path("onboarding") / "profile-source-v3.json"
MAX_PAYLOAD_BYTES = 64 * 1024
MAX_FACTS = 50
FACT_CATEGORIES = {
    "work_context",
    "desired_outcome",
    "workflow",
    "collaboration",
    "information_source",
    "boundary",
    "open_thread",
}
CERTAINTIES = {"confirmed", "tentative"}
ORIGINS = {"user_stated"}
SOURCES = {"initial_conversation", "in_app_refresh"}


def _profile_path(hermes_home: str | Path) -> Path:
    return Path(hermes_home).expanduser().resolve() / PROFILE_FILE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _validate_record(payload: Dict[str, Any]) -> tuple[str, list[Dict[str, str]], str]:
    if not isinstance(payload, dict) or set(payload) - {"summary", "facts", "source"}:
        raise ValueError("source profile accepts only summary, facts, and optional source")
    if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ValueError("source profile payload is too large")

    summary = payload.get("summary")
    facts = payload.get("facts")
    source = payload.get("source", "initial_conversation")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("summary is required")
    if len(summary) > 12_000:
        raise ValueError("summary is too long")
    if source not in SOURCES:
        raise ValueError("invalid source profile source")
    if not isinstance(facts, list) or len(facts) > MAX_FACTS:
        raise ValueError("facts must be a list with at most 50 items")

    normalized: list[Dict[str, str]] = []
    for fact in facts:
        if not isinstance(fact, dict) or set(fact) != {"id", "category", "value", "certainty", "origin"}:
            raise ValueError("each fact has a fixed source-profile schema")
        if fact.get("category") not in FACT_CATEGORIES:
            raise ValueError("invalid source-profile fact category")
        if fact.get("certainty") not in CERTAINTIES or fact.get("origin") not in ORIGINS:
            raise ValueError("invalid source-profile fact provenance")
        if not all(isinstance(fact.get(field), str) and fact[field].strip() for field in fact):
            raise ValueError("source-profile facts must contain text")
        if len(fact["id"]) > 120 or len(fact["value"]) > 4_000:
            raise ValueError("source-profile fact is too long")
        normalized.append({field: fact[field].strip() for field in ("id", "category", "value", "certainty", "origin")})

    return summary.strip(), normalized, source


def read_source_profile(*, hermes_home: str | Path | None = None) -> Dict[str, Any] | None:
    if hermes_home is None:
        from hermes_constants import get_hermes_home
        hermes_home = get_hermes_home()
    target = _profile_path(hermes_home)
    if not target.is_file():
        return None
    with target.open("r", encoding="utf-8") as handle:
        record = json.load(handle)
    if not isinstance(record, dict) or record.get("schema_version") != 3:
        raise ValueError("source profile has an unsupported schema")
    return record


def _merge_facts(
    previous: Dict[str, Any] | None, incoming: list[Dict[str, str]]
) -> list[Dict[str, str]]:
    """Merge refresh facts by stable id without treating omissions as deletes.

    A refresh only contains what the conversation added or corrected.  Keep the
    established order for normal saves so a corrected fact stays in place.  If
    the combined profile exceeds the fixed cap, keep facts from this refresh
    first, then the older untouched facts in their prior order.  This makes a
    newly stated correction/addition survive the cap deterministically without
    asking the model to reproduce the whole profile.
    """
    existing = previous.get("facts", []) if previous else []
    merged = [dict(fact) for fact in existing if isinstance(fact, dict)]
    positions = {
        fact.get("id"): index
        for index, fact in enumerate(merged)
        if isinstance(fact.get("id"), str)
    }
    incoming_ids: list[str] = []

    for fact in incoming:
        fact_id = fact["id"]
        if fact_id not in incoming_ids:
            incoming_ids.append(fact_id)
        if fact_id in positions:
            merged[positions[fact_id]] = fact
        else:
            positions[fact_id] = len(merged)
            merged.append(fact)

    if len(merged) <= MAX_FACTS:
        return merged

    incoming_by_id = {fact["id"]: fact for fact in incoming}
    current_facts = [incoming_by_id[fact_id] for fact_id in incoming_ids]
    untouched_facts = [fact for fact in merged if fact.get("id") not in incoming_by_id]
    return (current_facts + untouched_facts)[:MAX_FACTS]


def save_source_profile(payload: Dict[str, Any], *, hermes_home: str | Path | None = None) -> Dict[str, Any]:
    if hermes_home is None:
        from hermes_constants import get_hermes_home
        hermes_home = get_hermes_home()
    summary, facts, source = _validate_record(payload)
    target = _profile_path(hermes_home)
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = read_source_profile(hermes_home=hermes_home)
    timestamp = _now()
    record = {
        "schema_version": 3,
        "created_at": previous.get("created_at", timestamp) if previous else timestamp,
        "updated_at": timestamp,
        "source": source,
        "capture_status": "saved_from_conversation",
        "summary": summary,
        "facts": _merge_facts(previous, facts),
    }
    temp = target.with_suffix(f"{target.suffix}.tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, target)
    except Exception:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return record


SOURCE_PROFILE_SCHEMA = {
    "name": "source_profile",
    "description": "Read or save only the voluntary onboarding source profile. For action=save, profile.summary, profile.facts, and profile.source are all required. Never use it for USER.md, MEMORY.md, SOUL.md, file access, or workspace actions.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["read", "save"]},
            "profile": {
                "type": "object",
                "description": "Required for action=save. Do not call save until this complete object is ready.",
                "additionalProperties": False,
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "A concise summary based only on what the user shared.",
                    },
                    "facts": {
                        "type": "array",
                        "description": "Zero or more facts explicitly stated by the user.",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "id": {"type": "string"},
                                "category": {"type": "string", "enum": sorted(FACT_CATEGORIES)},
                                "value": {"type": "string"},
                                "certainty": {"type": "string", "enum": sorted(CERTAINTIES)},
                                "origin": {"type": "string", "enum": sorted(ORIGINS)},
                            },
                            "required": ["id", "category", "value", "certainty", "origin"],
                        },
                    },
                    "source": {"type": "string", "enum": sorted(SOURCES)},
                },
                "required": ["summary", "facts", "source"],
            },
        },
        "required": ["action"],
    },
}


def source_profile_tool(*, action: str, profile: Dict[str, Any] | None = None) -> str:
    if action == "read":
        return json.dumps({"success": True, "profile": read_source_profile()}, ensure_ascii=False)
    if action == "save":
        if not isinstance(profile, dict):
            return tool_error("source_profile save requires a profile object")
        return json.dumps({
            "success": True,
            "status": "saved",
            "profile": save_source_profile(profile),
            "next_step": "Stop calling tools and provide the required final response to the user.",
        }, ensure_ascii=False)
    return tool_error("source_profile action must be read or save")


registry.register(
    name="source_profile",
    toolset="source_profile",
    schema=SOURCE_PROFILE_SCHEMA,
    handler=lambda args, **_kwargs: source_profile_tool(
        action=args.get("action", ""),
        profile=args.get("profile"),
    ),
    check_fn=lambda: True,
    emoji="🗂️",
)
