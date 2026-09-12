import json
import os
import tempfile
import unittest
from pathlib import Path

from tools.source_profile_tool import SOURCE_PROFILE_SCHEMA, read_source_profile, save_source_profile, source_profile_tool


class SourceProfileToolTests(unittest.TestCase):
    def test_profile_workflow_keeps_the_conversation_open_and_saves_without_a_second_consent_question(self):
        workflow = Path(__file__).resolve().parents[1] / "apps" / "desktop" / "assets" / "super-agent-workflows" / "profile-source-v4" / "SKILL.md"
        content = workflow.read_text(encoding="utf-8")

        self.assertIn("trợ lý/quản gia số", content)
        self.assertIn("mình muốn hiểu thêm một chút", content)
        self.assertIn("Đừng lặp máy móc", content)
        self.assertIn("Không có số câu, số lượt", content)
        self.assertIn("Đừng biến cuộc trò chuyện thành buổi tư vấn", content)
        self.assertIn("Không mặc định biến câu hỏi thành danh sách lựa chọn", content)
        self.assertIn("chỉ một ngôn ngữ người dùng đang dùng", content)
        self.assertIn("khoảng trống nào còn đáng hỏi", content)
        self.assertIn("source_profile", content)
        self.assertIn('action: "read"', content)
        self.assertIn("chỉ gửi fact mới hoặc fact đã thay đổi", content)
        self.assertIn("Không hỏi lại người dùng để xin xác nhận lưu", content)
        self.assertIn(
            "Mình đã lưu những điều bạn chia sẻ vào Hồ sơ nguồn để phục vụ công việc sau này. Bạn luôn có thể cập nhật thêm khi muốn.",
            content,
        )

    def test_saves_only_the_fixed_v3_record_with_free_text_sources(self):
        with tempfile.TemporaryDirectory() as home:
            saved = save_source_profile({
                "summary": "Tuan làm marketing và phát triển Super Agent.",
                "facts": [{
                    "id": "information-sources",
                    "category": "information_source",
                    "value": "Desktop, Google Drive/Marketing và email",
                    "certainty": "confirmed",
                    "origin": "user_stated",
                }],
            }, hermes_home=home)

            target = Path(home, "onboarding", "profile-source-v3.json")
            self.assertEqual(saved["capture_status"], "saved_from_conversation")
            self.assertTrue(target.is_file())
            self.assertFalse(Path(f"{target}.tmp").exists())
            self.assertEqual(read_source_profile(hermes_home=home)["facts"][0]["value"], "Desktop, Google Drive/Marketing và email")

    def test_profile_tool_is_visible_directly_to_the_profile_session(self):
        from model_tools import get_tool_definitions

        names = [
            definition["function"]["name"]
            for definition in get_tool_definitions(
                enabled_toolsets=["source_profile"],
                quiet_mode=True,
            )
        ]

        self.assertEqual(names, ["source_profile"])

    def test_save_schema_requires_a_complete_nested_profile(self):
        profile = SOURCE_PROFILE_SCHEMA["parameters"]["properties"]["profile"]

        self.assertEqual(profile["required"], ["summary", "facts", "source"])
        self.assertFalse(profile["additionalProperties"])
        self.assertEqual(
            profile["properties"]["facts"]["items"]["required"],
            ["id", "category", "value", "certainty", "origin"],
        )

    def test_successful_save_tells_the_model_to_end_the_turn(self):
        with tempfile.TemporaryDirectory() as home:
            previous = os.environ.get("HERMES_HOME")
            os.environ["HERMES_HOME"] = home
            try:
                result = json.loads(source_profile_tool(
                    action="save",
                    profile={
                        "summary": "Tuan muốn Siêu trợ lý hỗ trợ công việc marketing.",
                        "facts": [],
                        "source": "in_app_refresh",
                    },
                ))
            finally:
                if previous is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = previous

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "saved")
        self.assertIn("Stop calling tools", result["next_step"])

    def test_later_save_keeps_existing_facts_and_replaces_the_summary(self):
        with tempfile.TemporaryDirectory() as home:
            first = save_source_profile({
                "summary": "Ban dau.",
                "facts": [
                    {"id": "a", "category": "work_context", "value": "A", "certainty": "confirmed", "origin": "user_stated"},
                    {"id": "b", "category": "workflow", "value": "B", "certainty": "confirmed", "origin": "user_stated"},
                ],
                "source": "initial_conversation",
            }, hermes_home=home)

            saved = save_source_profile({
                "summary": "Cap nhat moi nhat.",
                "facts": [
                    {"id": "c", "category": "desired_outcome", "value": "C", "certainty": "confirmed", "origin": "user_stated"},
                ],
                "source": "in_app_refresh",
            }, hermes_home=home)

            self.assertEqual(saved["created_at"], first["created_at"])
            self.assertEqual(saved["summary"], "Cap nhat moi nhat.")
            self.assertEqual([fact["id"] for fact in saved["facts"]], ["a", "b", "c"])

    def test_later_save_updates_matching_id_without_duplication(self):
        with tempfile.TemporaryDirectory() as home:
            save_source_profile({
                "summary": "Lan dau.",
                "facts": [
                    {"id": "a", "category": "work_context", "value": "A", "certainty": "confirmed", "origin": "user_stated"},
                    {"id": "b", "category": "workflow", "value": "B cu", "certainty": "tentative", "origin": "user_stated"},
                    {"id": "c", "category": "desired_outcome", "value": "C", "certainty": "confirmed", "origin": "user_stated"},
                ],
                "source": "initial_conversation",
            }, hermes_home=home)

            saved = save_source_profile({
                "summary": "Lan hai.",
                "facts": [
                    {"id": "b", "category": "workflow", "value": "B moi", "certainty": "confirmed", "origin": "user_stated"},
                ],
                "source": "in_app_refresh",
            }, hermes_home=home)

            self.assertEqual([fact["id"] for fact in saved["facts"]], ["a", "b", "c"])
            self.assertEqual(saved["facts"][1]["value"], "B moi")
            self.assertEqual(saved["facts"][1]["certainty"], "confirmed")

    def test_merge_overflow_keeps_the_current_update_before_older_untouched_facts(self):
        with tempfile.TemporaryDirectory() as home:
            initial_facts = [
                {"id": f"old-{index}", "category": "work_context", "value": f"Old {index}", "certainty": "confirmed", "origin": "user_stated"}
                for index in range(50)
            ]
            save_source_profile({
                "summary": "Lan dau.",
                "facts": initial_facts,
                "source": "initial_conversation",
            }, hermes_home=home)

            saved = save_source_profile({
                "summary": "Lan cap nhat.",
                "facts": [
                    {"id": "new", "category": "desired_outcome", "value": "Thong tin moi", "certainty": "confirmed", "origin": "user_stated"},
                ],
                "source": "in_app_refresh",
            }, hermes_home=home)

            self.assertEqual(len(saved["facts"]), 50)
            self.assertEqual(saved["facts"][0]["id"], "new")
            self.assertNotIn("old-49", [fact["id"] for fact in saved["facts"]])

    def test_profile_capture_stops_after_two_identical_failed_saves(self):
        from agent.tool_guardrails import ToolCallGuardrailConfig, ToolCallGuardrailController, source_profile_guardrail_config

        guardrails = ToolCallGuardrailController(source_profile_guardrail_config(ToolCallGuardrailConfig()))
        args = {"action": "save", "profile": {}}
        self.assertEqual(guardrails.after_call("source_profile", args, '{"error":"summary is required"}', failed=True).action, "allow")
        self.assertEqual(guardrails.after_call("source_profile", args, '{"error":"summary is required"}', failed=True).action, "halt")

    def test_rejects_unknown_fields_without_writing_anywhere_else(self):
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaises(ValueError):
                save_source_profile({
                    "summary": "x",
                    "facts": [],
                    "target": "..\\USER.md",
                }, hermes_home=home)

            self.assertFalse(Path(home, "USER.md").exists())
            self.assertFalse(Path(home, "onboarding", "profile-source-v3.json").exists())


if __name__ == "__main__":
    unittest.main()
