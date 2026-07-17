"""설정 충돌 응답 스키마 (camelCase, timeline_schemas.py와 동일 패턴).

한 건의 충돌은 같은 엔티티·같은 예약 ``state_key``에 대한 두 타임라인 상태
(``earlier``/``later``) 쌍이다 — 클라이언트가 "3화에서 사망 → 10화에서 등장" 같은
문구를 조립할 수 있게 각 상태의 ``chapter_id``/``global_seq``/``state_value``를 담는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class ConflictStateRef(_CamelModel):
    """충돌 쌍의 한쪽 타임라인 상태."""

    id: uuid.UUID
    chapter_id: uuid.UUID
    global_seq: int
    state_value: str
    created_at: datetime


class ConflictResponse(_CamelModel):
    """설정 충돌 1건 — 같은 엔티티·같은 예약 state_key에 대한 시점 역행 모순 쌍."""

    entity_id: uuid.UUID
    entity_name: str
    state_key: str
    earlier: ConflictStateRef
    later: ConflictStateRef
