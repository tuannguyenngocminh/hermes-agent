"""Contract tests for the read-only skills_hub_search tool."""

import json

import pytest

from tools.skills_hub import SkillMeta, SkillSource


class FakeSkillSource(SkillSource):
    def __init__(self, results):
        self.results = results

    def search(self, query: str, limit: int = 10):
        return self.results[:limit]

    def fetch(self, identifier: str):
        return None

    def inspect(self, identifier: str):
        return None

    def source_id(self) -> str:
        return "fake"


def _results(count=3):
    return [
        SkillMeta(
            name=f"skill-{index}",
            description=f"Description {index}",
            source="fake",
            identifier=f"fake/{index}",
            trust_level="community",
        )
        for index in range(count)
    ]


def _load_tool():
    from tools.skills_hub_search_tool import skills_hub_search

    return skills_hub_search


def test_search_returns_only_public_name_and_description(monkeypatch):
    tool = _load_tool()
    source = FakeSkillSource(_results())
    monkeypatch.setattr("tools.skills_hub.create_source_router", lambda auth: [source])

    result = json.loads(tool("việc gì đó", limit=5))

    assert result["success"] is True
    assert result["count"] == len(result["results"])
    assert all(set(item) == {"name", "description"} for item in result["results"])


def test_search_applies_limit(monkeypatch):
    tool = _load_tool()
    source = FakeSkillSource(_results(8))
    monkeypatch.setattr("tools.skills_hub.create_source_router", lambda auth: [source])

    result = json.loads(tool("x", limit=3))

    assert len(result["results"]) == 3


def test_search_returns_error_when_hub_fails(monkeypatch):
    tool = _load_tool()
    monkeypatch.setattr(
        "tools.skills_hub.create_source_router",
        lambda auth: (_ for _ in ()).throw(Exception("boom")),
    )

    result = json.loads(tool("x"))

    assert result["success"] is False
    assert "boom" in result["error"]


@pytest.mark.parametrize("query", ["", "   "])
def test_empty_query_short_circuits(monkeypatch, query):
    tool = _load_tool()
    monkeypatch.setattr(
        "tools.skills_hub.create_source_router",
        lambda auth: (_ for _ in ()).throw(AssertionError("hub should not be called")),
    )

    result = json.loads(tool(query))

    assert result["success"] is False
