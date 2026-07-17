"""업데이트 제안 데이터 접근 계층 (worldbible_repository.py와 동일 패턴).

커밋은 요청 단위 세션(``get_async_session``)이 성공 시 수행하므로 여기서는
add/flush만 한다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.dynamic_update.models import UpdateSuggestion


class DynamicUpdateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_chapter(
        self, work_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> list[UpdateSuggestion]:
        result = await self._session.execute(
            select(UpdateSuggestion)
            .where(UpdateSuggestion.work_id == work_id, UpdateSuggestion.chapter_id == chapter_id)
            .order_by(UpdateSuggestion.created_at)
        )
        return list(result.scalars().all())

    async def get(self, work_id: uuid.UUID, suggestion_id: uuid.UUID) -> UpdateSuggestion | None:
        result = await self._session.execute(
            select(UpdateSuggestion).where(
                UpdateSuggestion.id == suggestion_id, UpdateSuggestion.work_id == work_id
            )
        )
        return result.scalar_one_or_none()

    async def add(self, suggestion: UpdateSuggestion) -> UpdateSuggestion:
        self._session.add(suggestion)
        await self._session.flush()
        return suggestion
