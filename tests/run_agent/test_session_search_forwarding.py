import json
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from run_agent import AIAgent


def _mock_response():
    message = SimpleNamespace(content="done", tool_calls=None)
    choice = SimpleNamespace(message=message, finish_reason="stop")
    return SimpleNamespace(
        choices=[choice],
        model="test/model",
        usage=SimpleNamespace(prompt_tokens=1, completion_tokens=1, total_tokens=2),
    )


def _make_agent(session_db):
    with (
        patch("run_agent.get_tool_definitions", return_value=[]),
        patch("run_agent.check_toolset_requirements", return_value={}),
        patch("run_agent.OpenAI"),
    ):
        agent = AIAgent(
            api_key="test-key",
            base_url="https://openrouter.ai/api/v1",
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
            session_db=session_db,
            session_id="forwarding-session",
            platform="acp",
        )
    agent.client = MagicMock()
    agent.client.chat.completions.create.return_value = _mock_response()
    return agent


def _install_fake_session_search(monkeypatch, captured):
    session_search_mod = ModuleType("tools.session_search_tool")

    def fake_session_search(**kwargs):
        captured.update(kwargs)
        return json.dumps({"success": True, "results": []})

    session_search_mod.session_search = fake_session_search
    monkeypatch.setitem(__import__("sys").modules, "tools.session_search_tool", session_search_mod)


def test_invoke_tool_forwards_browse_offset_and_time_scope(monkeypatch):
    captured = {}
    session_db = MagicMock()
    _install_fake_session_search(monkeypatch, captured)
    agent = _make_agent(session_db)

    result = json.loads(
        agent._invoke_tool(
            "session_search",
            {
                "query": "review",
                "limit": 10,
                "offset": 20,
                "last_active_after": 123,
                "last_active_before": 456,
            },
            "task-id",
        )
    )

    assert result["success"] is True
    assert captured["offset"] == 20
    assert captured["last_active_after"] == 123
    assert captured["last_active_before"] == 456


def test_sequential_tool_calls_forwards_browse_offset_and_time_scope(monkeypatch):
    captured = {}
    session_db = MagicMock()
    _install_fake_session_search(monkeypatch, captured)
    agent = _make_agent(session_db)
    tool_call = SimpleNamespace(
        id="search-1",
        function=SimpleNamespace(
            name="session_search",
            arguments=json.dumps(
                {
                    "query": "review",
                    "limit": 10,
                    "offset": 30,
                    "last_active_after": 111,
                    "last_active_before": 222,
                }
            ),
        ),
    )

    agent._execute_tool_calls_sequential(
        SimpleNamespace(tool_calls=[tool_call]),
        [],
        "task-id",
    )

    assert captured["offset"] == 30
    assert captured["last_active_after"] == 111
    assert captured["last_active_before"] == 222
