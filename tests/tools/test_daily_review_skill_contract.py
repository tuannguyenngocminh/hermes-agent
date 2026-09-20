"""Contract tests for the bundled B1 daily-review skill."""

from pathlib import Path


SKILL_PATH = (
    Path(__file__).resolve().parents[2]
    / "apps"
    / "desktop"
    / "assets"
    / "super-agent-workflows"
    / "tro-ly"
    / "sieu-tro-ly-ra-soat-hang-ngay"
    / "SKILL.md"
)

REQUIRED_HEADINGS = [
    "## Thành quả đã đạt được",
    "## Mách bạn",
    "## Năng lực nên mở khoá thêm",
    "## Công nghệ hữu ích cho bạn",
    "## Quy trình của chuyên gia",
]


def _skill_text() -> str:
    return SKILL_PATH.read_text(encoding="utf-8")


def test_skill_identity_and_five_headings_are_preserved_in_order():
    text = _skill_text()

    assert "name: sieu-tro-ly-ra-soat-hang-ngay" in text
    positions = [text.index(heading) for heading in REQUIRED_HEADINGS]
    assert positions == sorted(positions)


def test_skill_declares_explicit_baseline_incremental_pagination_contract():
    text = _skill_text().lower()

    assert "baseline" in text
    assert "incremental" in text
    assert "lookback" in text
    assert "has_more" in text
    assert "pagination" in text
    assert "next_offset" in text
    assert "last_active_after" in text
    assert "mọi trang" in text or "từng trang" in text
    assert "mỗi session" in text or "từng session" in text


def test_skill_requires_both_coverage_markers_and_honest_incomplete_delivery():
    text = _skill_text()

    assert "B1_REVIEW_COVERAGE_COMPLETE" in text
    assert "B1_REVIEW_COVERAGE_INCOMPLETE" in text
    assert "[SILENT]" in text
    assert (
        "trả đúng hai dòng: `B1_REVIEW_COVERAGE_COMPLETE` rồi `[SILENT]`"
        in text
    )
    assert "không được trả [silent]" in text.lower()
