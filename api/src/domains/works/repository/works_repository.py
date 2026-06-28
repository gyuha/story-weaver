"""작품(Work) 데이터 접근 계층.

모든 조회는 ``user_id``로 스코프된다(앱 레이어 멀티테넌시 — ADR-0005). 커밋은
요청 단위 세션(``get_async_session``)이 성공 시 수행하므로 여기서는 add/flush만 한다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.works.models import Work


class WorksRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user(self, user_id: uuid.UUID) -> list[Work]:
        result = await self._session.execute(
            select(Work).where(Work.user_id == user_id).order_by(Work.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_owned(self, work_id: uuid.UUID, user_id: uuid.UUID) -> Work | None:
        """소유자 스코프 단건 조회 — 타 사용자의 작품은 ``None``(교차 테넌트 격리)."""
        result = await self._session.execute(
            select(Work).where(Work.id == work_id, Work.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def add(self, work: Work) -> Work:
        self._session.add(work)
        await self._session.flush()
        return work

    async def delete(self, work: Work) -> None:
        await self._session.execute(delete(Work).where(Work.id == work.id))
