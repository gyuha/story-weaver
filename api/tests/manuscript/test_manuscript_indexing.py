"""화 본문 저장 시 임베딩 인덱싱 연동 테스트 (TDD, plan.md S2/S4).

``ManuscriptService.create_chapter``/``update_chapter``가 ``MemoryService``를 통해 화
본문을 임베딩해 ``embeddings`` 테이블에 upsert하는지 확인한다 — 수정 시 새 행이
아니라 기존 행을 갱신해야 한다(중복 방지).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

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


async def _update_and_count_indexing(
    fixture: _Fixture, chapter_id: uuid.UUID, data: ChapterUpdate
) -> int:
    """PATCH를 한 번 돌리고 `index_chapter`가 몇 번 불렸는지 센다."""
    async with AsyncSessionFactory() as session:
        service = _service(session)
        with patch.object(service._memory_service, "index_chapter", new=AsyncMock()) as spy:
            await service.update_chapter(
                fixture.work.id, fixture.user.id, fixture.episode_id, chapter_id, data
            )
            await session.commit()
        return spy.await_count


@pytest.fixture
async def indexed_chapter(fixture: _Fixture) -> uuid.UUID:
    async with AsyncSessionFactory() as session:
        chapter = await _service(session).create_chapter(
            fixture.work.id,
            fixture.user.id,
            fixture.episode_id,
            ChapterCreate(order_index=0, title="1장", body="김무사가 산문을 나섰다."),
        )
        await session.commit()
        return chapter.id


async def test_body_update_reindexes(fixture: _Fixture, indexed_chapter: uuid.UUID) -> None:
    """본문이 바뀌면 재색인한다 (회귀 — task #67 S2)."""
    count = await _update_and_count_indexing(
        fixture, indexed_chapter, ChapterUpdate(body="김무사가 돌아왔다.")
    )
    assert count == 1


async def test_summary_only_update_does_not_reindex(
    fixture: _Fixture, indexed_chapter: uuid.UUID
) -> None:
    """요약만 저장할 때 본문을 재임베딩하지 않는다 (task #67 S2).

    요약은 화를 요약할 때마다 저장되므로, 그때마다 본문 전체를 다시 임베딩하면
    화면에는 아무 표시 없이 비용만 나간다.
    """
    count = await _update_and_count_indexing(
        fixture, indexed_chapter, ChapterUpdate(summary="김무사가 산문을 나섰다는 이야기.")
    )
    assert count == 0


async def test_title_only_update_does_not_reindex(
    fixture: _Fixture, indexed_chapter: uuid.UUID
) -> None:
    """제목만 바꿔도 재임베딩하지 않는다 — 원래도 낭비였다 (task #67 S2)."""
    count = await _update_and_count_indexing(
        fixture, indexed_chapter, ChapterUpdate(title="개정 1장")
    )
    assert count == 0


async def test_emptying_body_reindexes(fixture: _Fixture, indexed_chapter: uuid.UUID) -> None:
    """본문을 비우는 것도 본문 변경이다 (task #67 S2).

    빈 문자열을 falsy로 판정해 건너뛰면 지워진 본문의 낡은 임베딩이 남아 메모리
    검색이 조용히 틀린다. 판정은 "`body` 키가 왔는가"여야 한다.
    """
    count = await _update_and_count_indexing(fixture, indexed_chapter, ChapterUpdate(body=""))
    assert count == 1
