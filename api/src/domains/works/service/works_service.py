"""작품(Work) 비즈니스 로직.

사용자 식별은 ``user_id``(UUID)만 받는다 — auth ``User`` 모델을 도메인 경계 안으로
들이지 않는다(api/CLAUDE.md 도메인 경계 규칙). 소유권 위반은 ``NotFoundError``로
교차 테넌트 정보 노출 없이 404 처리한다(ADR-0005).
"""

from __future__ import annotations

import uuid

from core.exceptions import NotFoundError
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.schemas import WorkCreate, WorkUpdate


class WorksService:
    def __init__(self, repo: WorksRepository) -> None:
        self._repo = repo

    async def list_works(self, user_id: uuid.UUID) -> list[Work]:
        return await self._repo.list_by_user(user_id)

    async def get_work(self, work_id: uuid.UUID, user_id: uuid.UUID) -> Work:
        work = await self._repo.get_owned(work_id, user_id)
        if work is None:
            raise NotFoundError("Work")
        return work

    async def create_work(self, user_id: uuid.UUID, data: WorkCreate) -> Work:
        work = Work(
            user_id=user_id,
            title=data.title,
            short_label=_short_label(data.title),
            genre=data.genre,
            sub_genre=data.keywords[0] if data.keywords else data.genre,
            keywords=list(data.keywords),
            style=data.style,
            status="구상",
            cover_theme="dark",
        )
        return await self._repo.add(work)

    async def update_work(self, work_id: uuid.UUID, user_id: uuid.UUID, data: WorkUpdate) -> Work:
        work = await self.get_work(work_id, user_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(work, field, value)
        return work

    async def delete_work(self, work_id: uuid.UUID, user_id: uuid.UUID) -> None:
        work = await self.get_work(work_id, user_id)
        await self._repo.delete(work)


def _short_label(title: str) -> str:
    """표지/사이드바용 한 글자 약자 — 프론트 SHORT_LABEL과 동일 규칙."""
    stripped = title.strip()
    return stripped[0] if stripped else "작"
