"""메모리 검색 응답 스키마 (camelCase, worldbible_schemas.py와 동일 패턴).

병합된 메모리 결과를 하나의 평평한 리스트로 반환한다(plan.md S4 — P1~P3를 별도
필드로 나누지 않고 ``priority``로만 구분, over-engineering 방지). ``type``에 따라
의미 있는 필드만 채워진다: ``entity``는 name/summary, ``timelineState``는
state_key/state_value/note, ``vectorMatch``는 source_type/source_id/content.
"""

from __future__ import annotations

import enum
import uuid

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from domains.memory.models import EmbeddingSourceType


class MemoryItemType(enum.StrEnum):
    """병합된 메모리 항목의 종류."""

    entity = "entity"
    timeline_state = "timeline_state"
    vector_match = "vector_match"


class _CamelModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class MemoryItemResponse(_CamelModel):
    """메모리 검색 결과 1건. ``priority``: 1=링크 엔티티, 2=타임라인 상태, 3=벡터 매칭."""

    type: MemoryItemType
    priority: int
    entity_id: uuid.UUID | None = None
    name: str | None = None
    summary: str | None = None
    state_key: str | None = None
    state_value: str | None = None
    note: str | None = None
    source_type: EmbeddingSourceType | None = None
    source_id: uuid.UUID | None = None
    content: str | None = None
