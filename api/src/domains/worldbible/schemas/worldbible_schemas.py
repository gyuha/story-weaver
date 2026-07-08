"""엔티티 카드(World Bible) 타입별 attributes JSONB 검증 스키마 (data-model.md 3.2).

``entities.attributes``는 JSONB라 DB 레벨 스키마가 없다 — ``entity_type``별로 다른
모양을 애플리케이션(Pydantic) 레벨에서 검증한다. 알려지지 않은 필드나 다른 타입의
필드가 섞이면 ``extra="forbid"``로 거부한다. 필드는 data-model.md 3.2가 명시한 키만
있고 필수 여부는 미결정이라, MVP 단계에서 점진 입력이 가능하도록 모두 선택(기본값
제공)으로 둔다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from domains.worldbible.models import EntityType


class _AttributesModel(BaseModel):
    """attributes JSONB 공통 베이스 — 알려지지 않은 필드는 거부."""

    model_config = ConfigDict(extra="forbid")


class RelationItem(_AttributesModel):
    """인물 카드의 방향성 있는 관계 한 건 (data-model.md 3.3)."""

    target_entity_id: uuid.UUID
    type: str
    note: str | None = None


class CharacterAttributes(_AttributesModel):
    """인물(character) attributes."""

    appearance: str = ""
    personality: str = ""
    speech_style: str = ""
    sample_lines: list[str] = Field(default_factory=list)
    relations: list[RelationItem] = Field(default_factory=list)


class LocationAttributes(_AttributesModel):
    """장소(location) attributes."""

    description: str = ""
    region: str = ""
    atmosphere: str = ""


class EventAttributes(_AttributesModel):
    """사건(event) attributes."""

    description: str = ""
    participants: list[uuid.UUID] = Field(default_factory=list)
    occurred_at_scene: uuid.UUID | None = None


class ItemAttributes(_AttributesModel):
    """아이템(item) attributes."""

    description: str = ""
    owner: uuid.UUID | None = None
    properties: str = ""


_ATTRIBUTES_BY_TYPE: dict[EntityType, type[_AttributesModel]] = {
    EntityType.character: CharacterAttributes,
    EntityType.location: LocationAttributes,
    EntityType.event: EventAttributes,
    EntityType.item: ItemAttributes,
}


def validate_entity_attributes(
    entity_type: EntityType, attributes: dict[str, Any]
) -> dict[str, Any]:
    """``entity_type``에 맞는 스키마로 ``attributes``를 검증하고 정규화된 dict를 반환.

    알려지지 않은/타입에 맞지 않는 필드는 pydantic ``ValidationError``로 거부된다.
    """
    schema = _ATTRIBUTES_BY_TYPE[entity_type]
    return schema.model_validate(attributes).model_dump(mode="json")


class _CamelModel(BaseModel):
    """camelCase 직렬화 + 속성 매핑 공통 베이스 (manuscript_schemas.py와 동일 패턴)."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class EntityCreate(_CamelModel):
    """엔티티 카드 생성 입력. ``attributes``는 서비스 레벨에서 ``entity_type``별로 검증한다."""

    entity_type: EntityType
    name: str = Field(min_length=1, max_length=255)
    aliases: list[str] = Field(default_factory=list)
    summary: str = Field(default="")
    attributes: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(_CamelModel):
    """엔티티 카드 수정 입력 — 모든 필드 선택(PATCH).

    ``entity_type``은 생성 후 불변이라 필드 자체가 없다 — 웹 mock ``updateEntity``의
    "type(카테고리)은 변경 불가" 규칙과 동일하게, 페이로드에 담겨도 무시된다.
    """

    name: str | None = Field(default=None, min_length=1, max_length=255)
    aliases: list[str] | None = None
    summary: str | None = None
    attributes: dict[str, Any] | None = None


class EntityResponse(_CamelModel):
    """엔티티 카드 응답."""

    id: uuid.UUID
    work_id: uuid.UUID
    entity_type: EntityType
    name: str
    aliases: list[str]
    summary: str
    attributes: dict[str, Any]
    created_at: datetime
    updated_at: datetime
