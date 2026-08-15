"""image_generation S3 — 프롬프트 조립 테스트 (TDD, `.forge/plan.md`).

`build_entity_image_prompt`가 템플릿 id 대신 (작품 화풍 id, 작품 톤, 카드 유형,
카드 attributes, 시각 묘사, 추가 지시)로 조립하는지 검증한다. DB·네트워크 없음.
"""

from __future__ import annotations

import pytest

from domains.image_generation.service import (
    build_entity_image_prompt,
    map_event_to_prompt,
    map_item_to_prompt,
)
from domains.image_generation.service.template_catalog import get_art_style, get_composition

pytestmark = pytest.mark.unit

_STYLE_ID = "ink"
_TONE = "무협풍 세계관, 습한 산중 분위기"

_ATTRS: dict[str, dict[str, object]] = {
    "character": {
        "appearance": "은발에 붉은 눈동자",
        "personality": "냉철하고 과묵함",
        "speech_style": "반말",
        "sample_lines": ["...그런가."],
        "relations": [{"target_entity_id": "00000000-0000-0000-0000-000000000000", "type": "적"}],
    },
    "location": {
        "description": "안개 낀 대나무 숲",
        "atmosphere": "음습하고 서늘한 새벽",
        "region": "무협풍 강남 지방",
    },
    "event": {
        "description": "성문이 무너지던 밤의 습격",
        "participants": ["11111111-1111-1111-1111-111111111111"],
        "occurred_at_scene": "22222222-2222-2222-2222-222222222222",
    },
    "item": {
        "description": "낡은 청동 검",
        "owner": "33333333-3333-3333-3333-333333333333",
        "properties": "손잡이에 새겨진 용무늬, 녹슨 칼날",
    },
}

_PRIMARY_WITHOUT_VISUAL = {
    "character": "은발에 붉은 눈동자",
    "location": "안개 낀 대나무 숲, 음습하고 서늘한 새벽, 무협풍 강남 지방",
    "event": "성문이 무너지던 밤의 습격",
    "item": "낡은 청동 검, 손잡이에 새겨진 용무늬, 녹슨 칼날",
}


def _style_fragment() -> str:
    style = get_art_style(_STYLE_ID)
    assert style is not None
    return style.prompt_fragment


def _composition_fragment(entity_type: str) -> str:
    composition = get_composition(entity_type)
    assert composition is not None
    return composition.prompt_fragment


# ---------------------------------------------------------------------------
# 사건·아이템 매핑 (S1에서 정한 부분 — 변경 없음)
# ---------------------------------------------------------------------------


def test_map_event_to_prompt_uses_description_only() -> None:
    assert map_event_to_prompt(_ATTRS["event"]) == "성문이 무너지던 밤의 습격"


def test_map_event_to_prompt_ignores_id_reference_fields() -> None:
    prompt = map_event_to_prompt(_ATTRS["event"])
    assert "11111111" not in prompt
    assert "22222222" not in prompt


def test_map_item_to_prompt_combines_description_and_properties() -> None:
    assert map_item_to_prompt(_ATTRS["item"]) == "낡은 청동 검, 손잡이에 새겨진 용무늬, 녹슨 칼날"


def test_map_item_to_prompt_ignores_owner_id_reference() -> None:
    assert "33333333" not in map_item_to_prompt(_ATTRS["item"])


# ---------------------------------------------------------------------------
# 최종 조립 — 유형 4종 x (시각 묘사 있음/없음) x (톤 있음/없음)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("entity_type", ["character", "location", "event", "item"])
@pytest.mark.parametrize("has_visual_description", [False, True])
@pytest.mark.parametrize("has_tone", [False, True])
def test_build_prompt_assembles_all_pieces_in_order(
    entity_type: str, has_visual_description: bool, has_tone: bool
) -> None:
    visual_description = "이전 생성 이미지에서 뽑은 상세 묘사" if has_visual_description else None
    work_tone = _TONE if has_tone else ""

    prompt = build_entity_image_prompt(
        _STYLE_ID,
        work_tone,
        entity_type,  # type: ignore[arg-type]
        _ATTRS[entity_type],
        visual_description=visual_description,
        extra_prompt="배경은 어두운 창고",
    )

    expected_primary = (
        "이전 생성 이미지에서 뽑은 상세 묘사"
        if has_visual_description
        else _PRIMARY_WITHOUT_VISUAL[entity_type]
    )
    expected_parts = [expected_primary, "배경은 어두운 창고"]
    if has_tone:
        expected_parts.append(_TONE)
    expected_parts.append(f"{_style_fragment()}, {_composition_fragment(entity_type)}")
    assert prompt == ". ".join(expected_parts)

    # 시각 묘사가 있으면 카드 필드는 대체되어 프롬프트에 남지 않는다(이어붙이지 않음).
    if has_visual_description:
        assert _PRIMARY_WITHOUT_VISUAL[entity_type] not in prompt

    # 화풍 어휘 + 구도 어휘가 모두 포함된다.
    assert _style_fragment() in prompt
    assert _composition_fragment(entity_type) in prompt


def test_build_prompt_character_excludes_non_visual_fields() -> None:
    prompt = build_entity_image_prompt(_STYLE_ID, "", "character", _ATTRS["character"])
    for excluded in ("냉철하고 과묵함", "반말", "그런가", "적"):
        assert excluded not in prompt


def test_build_prompt_blank_visual_description_falls_back_to_card_fields() -> None:
    """공백만 있는 시각 묘사는 '주어진 것'으로 보지 않고 카드 필드로 떨어진다."""
    prompt = build_entity_image_prompt(
        _STYLE_ID, "", "location", _ATTRS["location"], visual_description="   "
    )
    assert prompt.startswith(_PRIMARY_WITHOUT_VISUAL["location"])


def test_build_prompt_blank_tone_is_not_inserted() -> None:
    """공백만인 작품 톤은 '없는 것'으로 보고 넣지 않는다."""
    prompt = build_entity_image_prompt(_STYLE_ID, "   ", "event", _ATTRS["event"])
    assert (
        prompt
        == f"성문이 무너지던 밤의 습격. {_style_fragment()}, {_composition_fragment('event')}"
    )


def test_build_prompt_skips_empty_pieces_without_stray_separators() -> None:
    prompt = build_entity_image_prompt(_STYLE_ID, "", "event", {})
    assert prompt == f"{_style_fragment()}, {_composition_fragment('event')}"
    assert ". ." not in prompt
    assert not prompt.startswith(". ")


def test_build_prompt_unknown_art_style_raises() -> None:
    with pytest.raises(ValueError, match="화풍"):
        build_entity_image_prompt("no-such-style", "", "character", _ATTRS["character"])
