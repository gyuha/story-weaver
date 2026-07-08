"""캐릭터 관계도(v2-C) 비즈니스 로직 — S1 기본 그래프 + S2 시점별 관계 요약.

자체 테이블은 두지 않는다. S1은 worldbible 엔티티의 ``attributes.relations``를 그대로
그래프 엣지로 옮긴다. S2는 timeline의 ``TimelineState``에 ``relation_to_<entity_id>``
state_key 관례(새 테이블 없이 기존 key/value 컬럼을 그대로 재사용)로 기록된 시점별
관계 변화를 ``up_to_scene_id``까지 모아 엣지에 덮어쓰고(그 시점의 최신값), 모인 사실
전체를 LOW_COST 티어 LLM에 단 1회 넘겨 자연어 요약을 만든다(엣지별 호출 없음 — plan.md
"단일 요약 호출로 충분, 엣지별 호출 과설계 금지"). 대상 엔티티가 더 이상 존재하지
않는 관계/사실은 에러 대신 조용히 생략한다(conflicts_service.py와 동일하게 ID 기반
크로스 도메인 서비스 호출만 쓴다).
"""

from __future__ import annotations

import uuid
from typing import NamedTuple

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from domains.chat.ports import AbstractLLMPort
from domains.manuscript.service import ManuscriptService
from domains.moderation.service import invoke_with_retry
from domains.relationships.schemas import RelationshipEdge
from domains.timeline.models import TimelineState
from domains.timeline.service import TimelineService
from domains.works.service import WorksService
from domains.worldbible.models import Entity, EntityType
from domains.worldbible.service import WorldBibleService

_RELATION_STATE_PREFIX = "relation_to_"

_SUMMARY_SYSTEM_PROMPT = (
    "당신은 웹소설의 인물 관계 변화를 요약하는 보조 AI입니다. 주어진 관계 사실 목록을 "
    "바탕으로 현재 시점까지의 인물 관계를 한두 문장으로 간결하게 요약하세요. 다른 설명 "
    "없이 요약문만 출력하세요."
)


class _Edge(NamedTuple):
    source_id: uuid.UUID
    source_name: str
    target_id: uuid.UUID
    target_name: str
    type: str
    note: str | None


def _parse_relation_target(state_key: str) -> uuid.UUID | None:
    """``relation_to_<uuid>`` state_key에서 대상 엔티티 id를 추출(형식이 아니면 None)."""
    if not state_key.startswith(_RELATION_STATE_PREFIX):
        return None
    try:
        return uuid.UUID(state_key[len(_RELATION_STATE_PREFIX) :])
    except ValueError:
        return None


def _build_summary_messages(facts: list[str]) -> list[BaseMessage]:
    return [
        SystemMessage(content=_SUMMARY_SYSTEM_PROMPT),
        HumanMessage(content="[관계 사실]\n" + "\n".join(facts)),
    ]


class RelationshipsService:
    def __init__(
        self,
        works_service: WorksService,
        worldbible_service: WorldBibleService,
        timeline_service: TimelineService,
        manuscript_service: ManuscriptService,
    ) -> None:
        self._works_service = works_service
        self._worldbible_service = worldbible_service
        self._timeline_service = timeline_service
        self._manuscript_service = manuscript_service

    async def get_relationships(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        up_to_scene_id: uuid.UUID | None,
        llm: AbstractLLMPort,
    ) -> tuple[list[RelationshipEdge], str | None]:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        entities = await self._worldbible_service.list_entities(work_id, user_id)
        entity_by_id = {entity.id: entity for entity in entities}
        characters = [e for e in entities if e.entity_type == EntityType.character]

        edges: dict[tuple[uuid.UUID, uuid.UUID], _Edge] = {}
        for character in characters:
            for relation in character.attributes.get("relations", []):
                target = entity_by_id.get(uuid.UUID(relation["target_entity_id"]))
                if target is None:
                    continue  # dangling target — 에러 대신 생략(plan.md)
                edges[(character.id, target.id)] = _Edge(
                    character.id,
                    character.name,
                    target.id,
                    target.name,
                    relation["type"],
                    relation.get("note"),
                )

        facts: list[str] = []
        if up_to_scene_id is not None:
            for character in characters:
                await self._apply_relation_states(
                    work_id, user_id, character, up_to_scene_id, entity_by_id, edges, facts
                )

        summary = await self._summarize(llm, facts) if facts else None
        response_edges = [
            RelationshipEdge(
                source_entity_id=edge.source_id,
                source_name=edge.source_name,
                target_entity_id=edge.target_id,
                target_name=edge.target_name,
                type=edge.type,
                note=edge.note,
            )
            for edge in edges.values()
        ]
        return response_edges, summary

    async def _apply_relation_states(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        character: Entity,
        up_to_scene_id: uuid.UUID,
        entity_by_id: dict[uuid.UUID, Entity],
        edges: dict[tuple[uuid.UUID, uuid.UUID], _Edge],
        facts: list[str],
    ) -> None:
        """``character``의 ``relation_to_*`` 상태를 ``up_to_scene_id``까지 모아 엣지/사실에 반영.

        같은 대상에 대해 여러 시점의 상태가 있으면 씬 ``global_seq``가 가장 큰(가장
        나중) 상태만 "그 시점의 관계"로 채택한다.
        """
        states = await self._timeline_service.list_timeline_states(
            work_id, user_id, character.id, up_to_scene_id
        )
        latest_seq: dict[uuid.UUID, int] = {}
        latest_state: dict[uuid.UUID, TimelineState] = {}
        for state in states:
            target_id = _parse_relation_target(state.state_key)
            if target_id is None or target_id not in entity_by_id:
                continue  # 관계 상태가 아니거나 대상이 사라짐 — 생략
            scene = await self._manuscript_service.get_scene_by_id(work_id, user_id, state.scene_id)
            if target_id not in latest_seq or scene.global_seq >= latest_seq[target_id]:
                latest_seq[target_id] = scene.global_seq
                latest_state[target_id] = state

        for target_id, state in latest_state.items():
            target = entity_by_id[target_id]
            edges[(character.id, target_id)] = _Edge(
                character.id, character.name, target_id, target.name, state.state_value, state.note
            )
            note_part = f" ({state.note})" if state.note else ""
            facts.append(f"{character.name} → {target.name}: {state.state_value}{note_part}")

    async def _summarize(self, llm: AbstractLLMPort, facts: list[str]) -> str | None:
        outcome = await invoke_with_retry(llm, _build_summary_messages(facts))
        if outcome.declined:
            return None  # eco: 부가 정보라 거절돼도 조회 자체는 그대로 성공 응답한다
        return outcome.chunks[0]
