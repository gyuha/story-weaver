"""동적 업데이트 추출 결과 스키마 (plan.md M3-S1).

씬 본문에서 추출한 신규 설정 후보 3종 — 신규 엔티티 후보 / 기존 엔티티 속성 변경 /
타임라인 상태 변화. LLM이 채워 넣는 응답이라 ``entity_id``도 엄격한 UUID로 검증하지
않고 문자열로 둔다 — 형식이 어긋난 항목이 있어도 그 필드 자체가 문자열이라 파싱은
살아남고, 실제 엔티티와의 대조는 S2(매칭)가 담당한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from domains.dynamic_update.models import SuggestionKind, SuggestionStatus


class _CamelModel(BaseModel):
    """camelCase 직렬화 + 속성 매핑 공통 베이스 (worldbible_schemas.py와 동일 패턴)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class CandidateEntity(_CamelModel):
    """LLM이 발견한, 아직 카드가 없는 신규 엔티티 후보."""

    name: str
    summary: str = ""


class AttributeChange(_CamelModel):
    """기존 엔티티의 속성 변경 후보."""

    entity_id: str
    attribute: str
    new_value: str


class TimelineChange(_CamelModel):
    """기존 엔티티의 타임라인 상태 변화 후보(예: life_status=dead)."""

    entity_id: str
    state_key: str
    state_value: str


class ExtractUpdatesResponse(_CamelModel):
    """추출 결과 — 3개 카테고리. 파싱 실패 시 모두 빈 리스트."""

    candidate_entities: list[CandidateEntity] = Field(default_factory=list)
    attribute_changes: list[AttributeChange] = Field(default_factory=list)
    timeline_changes: list[TimelineChange] = Field(default_factory=list)


class UpdateSuggestionResponse(_CamelModel):
    """업데이트 제안 응답 (plan.md M3-S2). ``payload`` 모양은 ``kind``에 따라 다르다."""

    id: uuid.UUID
    work_id: uuid.UUID
    chapter_id: uuid.UUID
    kind: SuggestionKind
    payload: dict[str, Any]
    status: SuggestionStatus
    created_at: datetime
