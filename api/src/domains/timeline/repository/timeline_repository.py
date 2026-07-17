"""타임라인 상태·씬-엔티티 링크 데이터 접근 계층.

타임라인 상태는 ``work_id``+``entity_id``로 스코프하고, ``up_to_chapter_id`` 필터는
manuscript 도메인이 계산해 넘겨준 "그 이하 global_seq를 가진 챕터 id 목록"으로 적용한다
(chapters 테이블을 직접 조회/조인하지 않아 도메인 간 직접 모델 import 없이 ID만으로
필터, timeline_service.py 참조). 씬-엔티티 링크는 ``chapter_id``+``entity_id``로 직접
스코프된다(둘 다 이미 소유권 검증을 거친 값 — 서비스 계층). 커밋은 요청 단위 세션
(``get_async_session``)이 성공 시 수행하므로 여기서는 add/flush만 한다
(manuscript_repository.py와 동일 패턴).
"""

from __future__ import annotations

import uuid
from collections.abc import Collection

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.timeline.models import SceneEntityLink, TimelineState


class TimelineRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # -- Timeline States -----------------------------------------------------

    async def list_by_entity(
        self,
        work_id: uuid.UUID,
        entity_id: uuid.UUID,
        chapter_ids: Collection[uuid.UUID] | None = None,
    ) -> list[TimelineState]:
        stmt = select(TimelineState).where(
            TimelineState.work_id == work_id, TimelineState.entity_id == entity_id
        )
        if chapter_ids is not None:
            stmt = stmt.where(TimelineState.chapter_id.in_(chapter_ids))
        stmt = stmt.order_by(TimelineState.created_at)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def add(self, state: TimelineState) -> TimelineState:
        self._session.add(state)
        await self._session.flush()
        return state

    # -- Scene-Entity Links ---------------------------------------------------

    async def list_links(self, chapter_id: uuid.UUID) -> list[SceneEntityLink]:
        result = await self._session.execute(
            select(SceneEntityLink)
            .where(SceneEntityLink.chapter_id == chapter_id)
            .order_by(SceneEntityLink.created_at)
        )
        return list(result.scalars().all())

    async def get_link(self, chapter_id: uuid.UUID, entity_id: uuid.UUID) -> SceneEntityLink | None:
        result = await self._session.execute(
            select(SceneEntityLink).where(
                SceneEntityLink.chapter_id == chapter_id, SceneEntityLink.entity_id == entity_id
            )
        )
        return result.scalar_one_or_none()

    async def add_link(self, link: SceneEntityLink) -> SceneEntityLink:
        self._session.add(link)
        await self._session.flush()
        return link

    async def delete_link(self, link: SceneEntityLink) -> None:
        await self._session.execute(delete(SceneEntityLink).where(SceneEntityLink.id == link.id))
