"""타임라인 상태 요청/응답 스키마 (camelCase, worldbible_schemas.py와 동일 패턴).

이 슬라이스는 작가 수동 입력(``source=author``)만 다룬다 — ``source``는 클라이언트
입력을 받지 않고 서비스에서 고정값으로 채운다(계획의 비목표).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from domains.timeline.models import SceneEntityLinkSource, TimelineStateSource


class _CamelModel(BaseModel):
    """camelCase 직렬화 + 속성 매핑 공통 베이스."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class SceneEntityLinkCreate(_CamelModel):
    """씬-엔티티 링크 생성 입력. ``source``는 서비스에서 ``author``로 고정된다."""

    entity_id: uuid.UUID


class SceneEntityLinkResponse(_CamelModel):
    """씬-엔티티 링크 응답."""

    id: uuid.UUID
    work_id: uuid.UUID
    scene_id: uuid.UUID
    entity_id: uuid.UUID
    source: SceneEntityLinkSource
    created_at: datetime


class TimelineStateCreate(_CamelModel):
    """타임라인 상태 생성 입력. ``source``는 서비스에서 ``author``로 고정된다."""

    scene_id: uuid.UUID
    state_key: str = Field(min_length=1, max_length=255)
    state_value: str = Field(min_length=1, max_length=255)
    note: str | None = None


class TimelineStateResponse(_CamelModel):
    """타임라인 상태 응답."""

    id: uuid.UUID
    work_id: uuid.UUID
    entity_id: uuid.UUID
    scene_id: uuid.UUID
    state_key: str
    state_value: str
    note: str | None
    source: TimelineStateSource
    created_at: datetime
