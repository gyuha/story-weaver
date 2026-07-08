"""캐릭터 관계도 응답 스키마 (camelCase, conflicts_schemas.py와 동일 패턴).

v2-C S1(기본 관계 그래프)과 S2(시점별 관계 요약)를 하나의 엔드포인트로 함께
표현한다 — ``up_to_scene_id`` 없이 호출하면 ``summary``는 항상 null이다.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class RelationshipEdge(_CamelModel):
    """관계 그래프의 방향성 있는 엣지 한 건."""

    source_entity_id: uuid.UUID
    source_name: str
    target_entity_id: uuid.UUID
    target_name: str
    type: str
    note: str | None


class RelationshipGraphResponse(_CamelModel):
    """관계 그래프 응답 — ``up_to_scene_id`` 미지정 시 ``summary``는 null."""

    edges: list[RelationshipEdge]
    summary: str | None = None
