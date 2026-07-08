"""매칭·제안 저장(S2) + 승인/거절 반영(S3) 비즈니스 로직.

추출(S1) 결과를 기존 엔티티와 매칭한다 — 매칭 알고리즘은 plan.md가 명시한 대로
"미결정, 단순 정확 매칭"만 쓴다(name/aliases 대소문자 무시 정확 일치).

- ``candidateEntities``는 이름이 기존 엔티티(name/aliases)와 일치하면 이미 알려진
  엔티티이므로 노이즈로 버린다. 일치하지 않을 때만 신규 제안으로 저장한다.
- ``attributeChanges``/``timelineChanges``는 이미 실제 엔티티 id를 담고 있으므로
  (S1이 프롬프트에 준 id를 그대로 돌려받음) 이름 매칭이 필요 없다 — 대상 엔티티의
  현재 속성값/최신 타임라인 상태값과 같으면 노이즈로 버린다.

승인(approve) 시 worldbible/timeline 도메인이 이미 확립한 쓰기 헬퍼
(``create_entity``/``update_entity``/``create_timeline_state``)를 그대로 재사용한다
(ADR-0005) — entities/scenes 등 다른 도메인의 ORM 모델은 import하지 않는다.
새 엔티티 재임베딩은 ``create_entity``/``update_entity`` 내부에서 이미 처리되므로
여기서 별도로 트리거하지 않는다. timeline_states는 원래부터 재임베딩 대상이 아니다
(memory 도메인의 ``EmbeddingSourceType``에 entity/scene만 있음).
"""

from __future__ import annotations

import uuid

from core.exceptions import ConflictError, NotFoundError
from domains.dynamic_update.models import SuggestionKind, SuggestionStatus, UpdateSuggestion
from domains.dynamic_update.repository import DynamicUpdateRepository
from domains.dynamic_update.schemas import (
    AttributeChange,
    CandidateEntity,
    ExtractUpdatesResponse,
    TimelineChange,
)
from domains.timeline.models import TimelineStateSource
from domains.timeline.schemas import TimelineStateCreate
from domains.timeline.service import TimelineService
from domains.works.service import WorksService
from domains.worldbible.models import Entity, EntityType
from domains.worldbible.schemas import EntityCreate, EntityUpdate
from domains.worldbible.service import WorldBibleService


def _matches_name(entity: Entity, name: str) -> bool:
    lowered = name.strip().lower()
    if entity.name.strip().lower() == lowered:
        return True
    return any(alias.strip().lower() == lowered for alias in entity.aliases)


class SuggestionService:
    def __init__(
        self,
        repo: DynamicUpdateRepository,
        works_service: WorksService,
        worldbible_service: WorldBibleService,
        timeline_service: TimelineService,
    ) -> None:
        self._repo = repo
        self._works_service = works_service
        self._worldbible_service = worldbible_service
        self._timeline_service = timeline_service

    # -- S2: 매칭 + 제안 저장 ----------------------------------------------

    async def process_extraction(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        scene_id: uuid.UUID,
        extraction: ExtractUpdatesResponse,
    ) -> list[UpdateSuggestion]:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인
        existing_entities = await self._worldbible_service.list_entities(work_id, user_id)
        created: list[UpdateSuggestion] = []

        for candidate in extraction.candidate_entities:
            if any(_matches_name(entity, candidate.name) for entity in existing_entities):
                continue  # 노이즈: 이미 알려진 엔티티
            created.append(
                await self._repo.add(
                    UpdateSuggestion(
                        work_id=work_id,
                        scene_id=scene_id,
                        kind=SuggestionKind.new_entity,
                        payload=candidate.model_dump(by_alias=True),
                        status=SuggestionStatus.pending,
                    )
                )
            )

        for change in extraction.attribute_changes:
            entity = await self._resolve_entity(work_id, user_id, change.entity_id)
            if entity is None or entity.attributes.get(change.attribute) == change.new_value:
                continue  # 대상 없음 또는 노이즈: 현재 값과 동일
            created.append(
                await self._repo.add(
                    UpdateSuggestion(
                        work_id=work_id,
                        scene_id=scene_id,
                        kind=SuggestionKind.attribute_change,
                        payload=change.model_dump(by_alias=True),
                        status=SuggestionStatus.pending,
                    )
                )
            )

        for timeline_change in extraction.timeline_changes:
            entity = await self._resolve_entity(work_id, user_id, timeline_change.entity_id)
            if entity is None:
                continue
            latest = await self._latest_state_value(
                work_id, user_id, entity.id, timeline_change.state_key
            )
            if latest == timeline_change.state_value:
                continue  # 노이즈: 최신 타임라인 상태와 동일
            created.append(
                await self._repo.add(
                    UpdateSuggestion(
                        work_id=work_id,
                        scene_id=scene_id,
                        kind=SuggestionKind.timeline_state,
                        payload=timeline_change.model_dump(by_alias=True),
                        status=SuggestionStatus.pending,
                    )
                )
            )

        return created

    async def _resolve_entity(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id_str: str
    ) -> Entity | None:
        try:
            entity_id = uuid.UUID(entity_id_str)
        except ValueError:
            return None  # LLM이 잘못된 id를 준 경우 — 조용히 무시(S1 스키마의 leniency)
        try:
            return await self._worldbible_service.get_entity(work_id, user_id, entity_id)
        except NotFoundError:
            return None

    async def _latest_state_value(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID, state_key: str
    ) -> str | None:
        states = await self._timeline_service.list_timeline_states(work_id, user_id, entity_id)
        matching = [s for s in states if s.state_key == state_key]
        return matching[-1].state_value if matching else None

    # -- S3: 조회 + 승인/거절 ------------------------------------------------

    async def list_suggestions(
        self, work_id: uuid.UUID, user_id: uuid.UUID, scene_id: uuid.UUID
    ) -> list[UpdateSuggestion]:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인
        return await self._repo.list_by_scene(work_id, scene_id)

    async def approve_suggestion(
        self, work_id: uuid.UUID, user_id: uuid.UUID, suggestion_id: uuid.UUID
    ) -> UpdateSuggestion:
        suggestion = await self._get_pending_suggestion(work_id, user_id, suggestion_id)

        if suggestion.kind is SuggestionKind.new_entity:
            candidate = CandidateEntity.model_validate(suggestion.payload)
            # eco: LLM이 신규 엔티티의 entity_type을 분류하지 않으므로(name/summary만
            # 추출) character로 고정한다 — 분류가 필요해지면 그때 스키마를 확장한다.
            await self._worldbible_service.create_entity(
                work_id,
                user_id,
                EntityCreate(
                    entity_type=EntityType.character,
                    name=candidate.name,
                    summary=candidate.summary,
                ),
            )
        elif suggestion.kind is SuggestionKind.attribute_change:
            attribute_change = AttributeChange.model_validate(suggestion.payload)
            entity_id = uuid.UUID(attribute_change.entity_id)
            entity = await self._worldbible_service.get_entity(work_id, user_id, entity_id)
            attributes = dict(entity.attributes)
            attributes[attribute_change.attribute] = attribute_change.new_value
            await self._worldbible_service.update_entity(
                work_id, user_id, entity_id, EntityUpdate(attributes=attributes)
            )
        else:
            timeline_change = TimelineChange.model_validate(suggestion.payload)
            entity_id = uuid.UUID(timeline_change.entity_id)
            await self._timeline_service.create_timeline_state(
                work_id,
                user_id,
                entity_id,
                TimelineStateCreate(
                    scene_id=suggestion.scene_id,
                    state_key=timeline_change.state_key,
                    state_value=timeline_change.state_value,
                ),
                source=TimelineStateSource.ai_suggested,
            )

        suggestion.status = SuggestionStatus.approved
        return suggestion

    async def reject_suggestion(
        self, work_id: uuid.UUID, user_id: uuid.UUID, suggestion_id: uuid.UUID
    ) -> UpdateSuggestion:
        suggestion = await self._get_pending_suggestion(work_id, user_id, suggestion_id)
        suggestion.status = SuggestionStatus.rejected
        return suggestion

    async def _get_pending_suggestion(
        self, work_id: uuid.UUID, user_id: uuid.UUID, suggestion_id: uuid.UUID
    ) -> UpdateSuggestion:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인
        suggestion = await self._repo.get(work_id, suggestion_id)
        if suggestion is None:
            raise NotFoundError("UpdateSuggestion")
        if suggestion.status is not SuggestionStatus.pending:
            raise ConflictError("Suggestion already resolved.")
        return suggestion
