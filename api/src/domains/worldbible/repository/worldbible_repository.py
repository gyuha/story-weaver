"""World Bible 엔티티 카드 데이터 접근 계층.

엔티티는 계층 구조 없이 ``work_id``로 직접 스코프된다. 커밋은 요청 단위 세션
(``get_async_session``)이 성공 시 수행하므로 여기서는 add/flush만 한다
(manuscript_repository.py와 동일 패턴).
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.worldbible.models import Entity


class WorldBibleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_work(self, work_id: uuid.UUID) -> list[Entity]:
        result = await self._session.execute(
            select(Entity).where(Entity.work_id == work_id).order_by(Entity.created_at)
        )
        return list(result.scalars().all())

    async def get(self, work_id: uuid.UUID, entity_id: uuid.UUID) -> Entity | None:
        result = await self._session.execute(
            select(Entity).where(Entity.id == entity_id, Entity.work_id == work_id)
        )
        return result.scalar_one_or_none()

    async def add(self, entity: Entity) -> Entity:
        self._session.add(entity)
        await self._session.flush()
        return entity

    async def delete(self, entity: Entity) -> None:
        await self._session.execute(delete(Entity).where(Entity.id == entity.id))
