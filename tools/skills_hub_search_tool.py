"""Read-only search across Hermes Skills Hub sources (no local install)."""

from __future__ import annotations

from typing import Any, Dict, List

from tools.registry import registry, tool_error, tool_result

_DEFAULT_LIMIT = 5
_MAX_LIMIT = 20


def skills_hub_search(query: str, limit: int = _DEFAULT_LIMIT) -> str:
    """Search Skills Hub sources and expose only safe public metadata."""
    try:
        query = (query or "").strip()
        if not query:
            return tool_error("query is required and cannot be empty.", success=False)

        safe_limit = max(1, min(int(limit) if limit else _DEFAULT_LIMIT, _MAX_LIMIT))

        from tools.skills_hub import GitHubAuth, create_source_router, unified_search

        sources = create_source_router(GitHubAuth())
        raw = unified_search(query, sources, source_filter="all", limit=safe_limit) or []
        results: List[Dict[str, Any]] = [
            {"name": item.name, "description": item.description} for item in raw
        ]
        return tool_result(success=True, results=results, count=len(results))
    except Exception as exc:
        return tool_error(f"Skills Hub search unavailable: {exc}", success=False)


SKILLS_HUB_SEARCH_SCHEMA = {
    "name": "skills_hub_search",
    "description": (
        "Search the Hermes Skills Hub (GitHub, official index, community "
        "registries) for existing skills matching a query. Read-only: does "
        "not install or download anything, no side effects, no approval "
        "needed. Use before creating a new skill, to check whether one "
        "already exists that does the same job."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Short search phrase describing the task the skill should do.",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return (default 5, max 20).",
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
}


registry.register(
    name="skills_hub_search",
    toolset="skills",
    schema=SKILLS_HUB_SEARCH_SCHEMA,
    handler=lambda args, **_: skills_hub_search(
        query=args.get("query", ""), limit=args.get("limit", _DEFAULT_LIMIT)
    ),
    emoji="🔎",
)
