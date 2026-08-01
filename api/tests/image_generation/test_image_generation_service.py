"""image_generation 도메인 S1/S2 테스트 (TDD, v2d-image-generation-poc.md).

라우팅·실 이미지 API 호출(S3, 인프라 포크로 halt) 없이
:mod:`domains.image_generation.service`를 직접 호출한다.
"""

from __future__ import annotations

import pytest

from domains.image_generation.service import (
    map_character_to_prompt,
    map_location_to_prompt,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# S1 — 인물 카드 매핑 (image-generation.md 3.1)
# ---------------------------------------------------------------------------


def test_map_character_to_prompt_reflects_appearance() -> None:
    attributes = {"appearance": "은발에 붉은 눈동자, 흑색 장포"}
    assert map_character_to_prompt(attributes) == "은발에 붉은 눈동자, 흑색 장포"


def test_map_character_to_prompt_ignores_non_visual_fields() -> None:
    attributes = {
        "appearance": "은발에 붉은 눈동자",
        "personality": "냉철하고 과묵함",
        "speech_style": "반말",
        "sample_lines": ["...그런가."],
        "relations": [{"target_entity_id": "00000000-0000-0000-0000-000000000000", "type": "적"}],
    }
    assert map_character_to_prompt(attributes) == "은발에 붉은 눈동자"


def test_map_character_to_prompt_missing_appearance_is_empty() -> None:
    assert map_character_to_prompt({}) == ""


# ---------------------------------------------------------------------------
# S1 — 장소 카드 매핑 (image-generation.md 3.2)
# ---------------------------------------------------------------------------


def test_map_location_to_prompt_combines_all_visual_slots_in_order() -> None:
    attributes = {
        "description": "안개 낀 대나무 숲",
        "atmosphere": "음습하고 서늘한 새벽",
        "region": "무협풍 강남 지방",
    }
    assert (
        map_location_to_prompt(attributes)
        == "안개 낀 대나무 숲, 음습하고 서늘한 새벽, 무협풍 강남 지방"
    )


def test_map_location_to_prompt_skips_empty_slots() -> None:
    attributes = {"description": "안개 낀 대나무 숲", "atmosphere": "", "region": ""}
    assert map_location_to_prompt(attributes) == "안개 낀 대나무 숲"


def test_map_location_to_prompt_missing_fields_is_empty() -> None:
    assert map_location_to_prompt({}) == ""
