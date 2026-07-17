"""원고 계층 데이터 접근 계층.

시놉시스는 작품당 1개(``work_id`` unique) — 조회는 ``work_id``로, 생성/치환은 upsert로
처리한다. 부·챕터는 직속 부모 FK(work_id·episode_id)로 스코프해 조회한다 — 해당 부모가
이미 작품 소유권 검증을 거쳤으므로(서비스 계층) 별도 work_id 필터는 중복이다. 커밋은
요청 단위 세션(``get_async_session``)이 성공 시 수행하므로 여기서는 add/flush만 한다
(works_repository.py와 동일 패턴).
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.manuscript.models import Chapter, Episode, Synopsis


class ManuscriptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_synopsis_by_work(self, work_id: uuid.UUID) -> Synopsis | None:
        result = await self._session.execute(select(Synopsis).where(Synopsis.work_id == work_id))
        return result.scalar_one_or_none()

    async def upsert_synopsis(self, work_id: uuid.UUID, body: str) -> Synopsis:
        synopsis = await self.get_synopsis_by_work(work_id)
        if synopsis is None:
            synopsis = Synopsis(work_id=work_id, body=body)
            self._session.add(synopsis)
        else:
            synopsis.body = body
        await self._session.flush()
        return synopsis

    # -- Episodes --------------------------------------------------------

    async def list_episodes(self, work_id: uuid.UUID) -> list[Episode]:
        result = await self._session.execute(
            select(Episode).where(Episode.work_id == work_id).order_by(Episode.order_index)
        )
        return list(result.scalars().all())

    async def get_episode(self, work_id: uuid.UUID, episode_id: uuid.UUID) -> Episode | None:
        result = await self._session.execute(
            select(Episode).where(Episode.id == episode_id, Episode.work_id == work_id)
        )
        return result.scalar_one_or_none()

    async def add_episode(self, episode: Episode) -> Episode:
        self._session.add(episode)
        await self._session.flush()
        return episode

    async def delete_episode(self, episode: Episode) -> None:
        await self._session.execute(delete(Episode).where(Episode.id == episode.id))

    # -- Chapters ---------------------------------------------------------

    async def list_chapters(self, episode_id: uuid.UUID) -> list[Chapter]:
        result = await self._session.execute(
            select(Chapter).where(Chapter.episode_id == episode_id).order_by(Chapter.order_index)
        )
        return list(result.scalars().all())

    async def get_chapter(self, episode_id: uuid.UUID, chapter_id: uuid.UUID) -> Chapter | None:
        result = await self._session.execute(
            select(Chapter).where(Chapter.id == chapter_id, Chapter.episode_id == episode_id)
        )
        return result.scalar_one_or_none()

    async def add_chapter(self, chapter: Chapter) -> Chapter:
        self._session.add(chapter)
        await self._session.flush()
        return chapter

    async def delete_chapter(self, chapter: Chapter) -> None:
        await self._session.execute(delete(Chapter).where(Chapter.id == chapter.id))

    async def flush(self) -> None:
        """대기 중인 변경을 DB로 내보낸다(``autoflush=False``라 재조회 전 명시 호출 필요)."""
        await self._session.flush()

    async def next_global_seq(self, work_id: uuid.UUID) -> int:
        """작품 내 현재 최대 ``global_seq`` + 1 (재계산 최적화는 비목표)."""
        result = await self._session.execute(
            select(func.max(Chapter.global_seq)).where(Chapter.work_id == work_id)
        )
        return (result.scalar_one_or_none() or 0) + 1

    async def get_chapter_by_id(self, work_id: uuid.UUID, chapter_id: uuid.UUID) -> Chapter | None:
        """계층 경로(episode_id) 없이 ``work_id``+``chapter_id``로 직접 조회.

        ``Chapter.work_id``가 이미 직접 스코프이므로 가능(timeline 도메인이 챕터의
        ``global_seq``를 ID만으로 조회하는 크로스 도메인 read helper의 기반).
        """
        result = await self._session.execute(
            select(Chapter).where(Chapter.id == chapter_id, Chapter.work_id == work_id)
        )
        return result.scalar_one_or_none()

    async def list_chapter_ids_up_to_seq(
        self, work_id: uuid.UUID, max_global_seq: int
    ) -> list[uuid.UUID]:
        """작품 내 ``global_seq <= max_global_seq``인 챕터 id 목록(시점 필터의 근거)."""
        result = await self._session.execute(
            select(Chapter.id).where(
                Chapter.work_id == work_id, Chapter.global_seq <= max_global_seq
            )
        )
        return list(result.scalars().all())
