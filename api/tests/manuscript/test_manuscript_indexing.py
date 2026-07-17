"""화 본문 저장 시 임베딩 인덱싱 연동 테스트 (TDD, plan.md S2/S4).

``ManuscriptService.create_chapter``/``update_chapter``가 ``MemoryService``를 통해 화
본문을 임베딩해 ``embeddings`` 테이블에 upsert하는지 확인한다 — 수정 시 새 행이
아니라 기존 행을 갱신해야 한다(중복 방지).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import ChapterCreate, ChapterUpdate, EpisodeCreate
from domains.manuscript.service import ManuscriptService
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.service import WorksService


class _Fixture:
    def __init__(self, user: User, work: Work, episode_id: uuid.UUID) -> None:
        self.user = user
        self.work = work
        self.episode_id = episode_id


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"ms-index-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()

        service = _service(session)
        episode = await service.create_episode(
            work.id, user.id, EpisodeCreate(title="1부", order_index=0)
        )
        await session.commit()

        yield _Fixture(user=user, work=work, episode_id=episode.id)
        await session.delete(user)  # cascade: user -> work -> episodes/chapters/embeddings
        await session.commit()


def _service(session: AsyncSessionFactory) -> ManuscriptService:  # type: ignore[valid-type]
    return ManuscriptService(
        ManuscriptRepository(session),
        WorksService(WorksRepository(session)),
        MemoryService(MemoryRepository(session)),
    )


async def _embedding_rows(chapter_id: uuid.UUID) -> list[Embedding]:
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(Embedding).where(
                Embedding.source_id == chapter_id,
                Embedding.source_type == EmbeddingSourceType.chapter,
            )
        )
        return list(result.scalars().all())


async def test_create_chapter_indexes_embedding(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        chapter = await _service(session).create_chapter(
            fixture.work.id,
            fixture.user.id,
            fixture.episode_id,
            ChapterCreate(order_index=0, title="1장", body="김무사가 산문을 나섰다."),
        )
        await session.commit()
        chapter_id = chapter.id

    rows = await _embedding_rows(chapter_id)
    assert len(rows) == 1
    assert rows[0].content == "김무사가 산문을 나섰다."


async def test_update_chapter_reembeds_without_duplicating(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        chapter = await _service(session).create_chapter(
            fixture.work.id,
            fixture.user.id,
            fixture.episode_id,
            ChapterCreate(order_index=0, title="1장", body="김무사가 산문을 나섰다."),
        )
        await session.commit()
        chapter_id = chapter.id

    async with AsyncSessionFactory() as session:
        await _service(session).update_chapter(
            fixture.work.id,
            fixture.user.id,
            fixture.episode_id,
            chapter_id,
            ChapterUpdate(body="김무사가 돌아왔다."),
        )
        await session.commit()

    rows = await _embedding_rows(chapter_id)
    assert len(rows) == 1  # 새 행이 아니라 기존 행 갱신
    assert rows[0].content == "김무사가 돌아왔다."
