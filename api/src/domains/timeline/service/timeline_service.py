"""타임라인 상태·씬-엔티티 링크 비즈니스 로직.

엔티티 소유권/스코프 확인은 worldbible 도메인의 ``WorldBibleService.get_entity``를,
씬 소유권/스코프 확인과 시점(``global_seq``) 비교는 manuscript 도메인의
``ManuscriptService``를 재사용한다(ADR-0005 — works에서 확립한 소유권 헬퍼를 하위
도메인이 재사용하는 패턴을 그대로 두 개의 크로스 도메인 참조에 적용). ``up_to_scene_id``
필터는 manuscript가 계산한 "그 이하 global_seq를 가진 씬 id 목록"으로 적용한다 —
timeline 도메인은 scenes/entities 테이블을 직접 조회/조인하거나 그 ORM 모델을
import하지 않는다(도메인 간 직접 모델 import 금지, ID만 주고받음). 씬-엔티티 링크
생성은 중복 시 409/500이 아니라 기존 행을 그대로 반환하는 idempotent 동작이다
(data-model.md "중복 방지" 요구 — 동시 요청 경쟁 상태 재시도는 다루지 않는다: eco,
이 슬라이스는 순차 요청만 다룸).
"""

from __future__ import annotations

import uuid

from core.exceptions import NotFoundError
from domains.manuscript.service import ManuscriptService
from domains.timeline.models import (
    SceneEntityLink,
    SceneEntityLinkSource,
    TimelineState,
    TimelineStateSource,
)
from domains.timeline.repository import TimelineRepository
from domains.timeline.schemas import TimelineStateCreate
from domains.worldbible.service import WorldBibleService


class TimelineService:
    def __init__(
        self,
        repo: TimelineRepository,
        worldbible_service: WorldBibleService,
        manuscript_service: ManuscriptService,
    ) -> None:
        self._repo = repo
        self._worldbible_service = worldbible_service
        self._manuscript_service = manuscript_service

    async def create_timeline_state(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_id: uuid.UUID,
        data: TimelineStateCreate,
        source: TimelineStateSource = TimelineStateSource.author,
    ) -> TimelineState:
        await self._worldbible_service.get_entity(work_id, user_id, entity_id)  # 소유권 확인
        # 소유권 확인
        await self._manuscript_service.get_scene_by_id(work_id, user_id, data.scene_id)
        state = TimelineState(
            work_id=work_id,
            entity_id=entity_id,
            scene_id=data.scene_id,
            state_key=data.state_key,
            state_value=data.state_value,
            note=data.note,
            source=source,
        )
        return await self._repo.add(state)

    async def list_timeline_states(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_id: uuid.UUID,
        up_to_scene_id: uuid.UUID | None = None,
    ) -> list[TimelineState]:
        await self._worldbible_service.get_entity(work_id, user_id, entity_id)  # 소유권 확인
        scene_ids: list[uuid.UUID] | None = None
        if up_to_scene_id is not None:
            scene_ids = await self._manuscript_service.list_scene_ids_up_to(
                work_id, user_id, up_to_scene_id
            )
        return await self._repo.list_by_entity(work_id, entity_id, scene_ids)

    # -- Scene-Entity Links -----------------------------------------------

    async def list_links(
        self, work_id: uuid.UUID, user_id: uuid.UUID, scene_id: uuid.UUID
    ) -> list[SceneEntityLink]:
        await self._manuscript_service.get_scene_by_id(work_id, user_id, scene_id)  # 소유권 확인
        return await self._repo.list_links(scene_id)

    async def create_link(
        self, work_id: uuid.UUID, user_id: uuid.UUID, scene_id: uuid.UUID, entity_id: uuid.UUID
    ) -> SceneEntityLink:
        await self._manuscript_service.get_scene_by_id(work_id, user_id, scene_id)  # 소유권 확인
        await self._worldbible_service.get_entity(work_id, user_id, entity_id)  # 소유권 확인
        existing = await self._repo.get_link(scene_id, entity_id)
        if existing is not None:
            return existing  # idempotent — 중복 방지(409/500 대신 기존 행 반환)
        link = SceneEntityLink(
            work_id=work_id,
            scene_id=scene_id,
            entity_id=entity_id,
            source=SceneEntityLinkSource.author,
        )
        return await self._repo.add_link(link)

    async def delete_link(
        self, work_id: uuid.UUID, user_id: uuid.UUID, scene_id: uuid.UUID, entity_id: uuid.UUID
    ) -> None:
        await self._manuscript_service.get_scene_by_id(work_id, user_id, scene_id)  # 소유권 확인
        link = await self._repo.get_link(scene_id, entity_id)
        if link is None:
            raise NotFoundError("SceneEntityLink")
        await self._repo.delete_link(link)
