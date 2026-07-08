"""엔티티 카드 attributes JSONB 타입별 검증 스키마 단위 테스트 (data-model.md 3.2).

DB 없이 순수 Pydantic 검증만 확인한다 — 타입별 정상 입력은 통과하고, 다른 타입의
필드나 알려지지 않은 필드가 섞이면 거부된다.
"""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from domains.worldbible.models import EntityType
from domains.worldbible.schemas import validate_entity_attributes


def test_character_attributes_accepted() -> None:
    result = validate_entity_attributes(
        EntityType.character,
        {
            "appearance": "백발의 노인",
            "personality": "과묵함",
            "speech_style": "하오체",
            "sample_lines": ["그리 하시게."],
            "relations": [
                {"target_entity_id": str(uuid.uuid4()), "type": "사제", "note": "1화에서 첫 만남"}
            ],
        },
    )
    assert result["appearance"] == "백발의 노인"
    assert result["relations"][0]["type"] == "사제"


def test_location_attributes_accepted() -> None:
    result = validate_entity_attributes(
        EntityType.location,
        {"description": "깊은 계곡", "region": "북부", "atmosphere": "음습함"},
    )
    assert result["region"] == "북부"


def test_event_attributes_accepted() -> None:
    entity_id = str(uuid.uuid4())
    scene_id = str(uuid.uuid4())
    result = validate_entity_attributes(
        EntityType.event,
        {"description": "야습", "participants": [entity_id], "occurred_at_scene": scene_id},
    )
    assert result["participants"] == [entity_id]
    assert result["occurred_at_scene"] == scene_id


def test_item_attributes_accepted() -> None:
    owner_id = str(uuid.uuid4())
    result = validate_entity_attributes(
        EntityType.item,
        {"description": "칠흑의 검", "owner": owner_id, "properties": "화속성 부여"},
    )
    assert result["owner"] == owner_id


def test_defaults_fill_when_omitted() -> None:
    result = validate_entity_attributes(EntityType.location, {})
    assert result == {"description": "", "region": "", "atmosphere": ""}


@pytest.mark.parametrize(
    ("entity_type", "attributes"),
    [
        # 인물 필드를 장소에 섞음 — 타입 불일치
        (EntityType.location, {"appearance": "백발의 노인"}),
        # 알려지지 않은 필드
        (EntityType.item, {"unknown_field": "x"}),
        # participants가 UUID 목록이어야 하는데 문자열 하나
        (EntityType.event, {"participants": "not-a-list"}),
        # owner가 UUID 형식이 아님
        (EntityType.item, {"owner": "not-a-uuid"}),
        # sample_lines 항목이 문자열이 아님
        (EntityType.character, {"sample_lines": [123]}),
    ],
)
def test_malformed_or_cross_type_attributes_rejected(
    entity_type: EntityType, attributes: dict[str, object]
) -> None:
    with pytest.raises(ValidationError):
        validate_entity_attributes(entity_type, attributes)
