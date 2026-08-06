"""manuscript 모델 실 DB 테스트 — 4개 테이블 insert + FK cascade 확인.

실 `core.database.AsyncSessionFactory`로 시놉시스·부(episode)·챕터·화 버전을 각 1건씩
insert하고, 부 삭제가 챕터까지, 챕터 삭제가 화 버전까지 DB FK cascade로 지워지는지
확인한다(works 도메인 test_works_isolation.py의 실 DB 테스트 패턴을 따름). 챕터가
집필 최소 단위로 ``body``/``global_seq``를 직접 보유한다(scenes 테이블은 폐지).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.manuscript.models import Chapter, ChapterVersion, Episode, Synopsis
from domains.works.models import Work


@pytest.fixture
async def work() -> AsyncIterator[Work]:
    """실 DB에 사용자+작품 1건을 만들고, 종료 후 정리(cascade로 하위 전부 삭제)."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"manuscript-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        w = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(w)
        await session.commit()
        yield w
        await session.delete(user)  # cascade: user -> work -> synopsis/episodes/chapters
        await session.commit()


async def test_insert_one_row_per_table(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        synopsis = Synopsis(work_id=work.id, body="요약")
        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add_all([synopsis, episode])
        await session.flush()

        chapter = Chapter(
            work_id=work.id,
            episode_id=episode.id,
            title="1장",
            order_index=0,
            body="본문",
            global_seq=1,
        )
        session.add(chapter)
        await session.commit()

        assert synopsis.id is not None
        assert episode.id is not None
        assert chapter.id is not None
        assert chapter.body == "본문"
        assert chapter.global_seq == 1


async def test_delete_episode_cascades_chapters(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add(episode)
        await session.flush()
        chapter = Chapter(
            work_id=work.id,
            episode_id=episode.id,
            title="1장",
            order_index=0,
            body="본문",
            global_seq=1,
        )
        session.add(chapter)
        await session.commit()
        chapter_id = chapter.id

        await session.delete(episode)
        await session.commit()

        chapter_result = await session.execute(select(Chapter).where(Chapter.id == chapter_id))
        assert chapter_result.scalar_one_or_none() is None


async def test_delete_chapter_cascades_versions(work: Work) -> None:
    """화 삭제 시 그 버전들도 DB FK cascade로 함께 사라진다 (plan.md S1 완성 기준)."""
    async with AsyncSessionFactory() as session:
        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add(episode)
        await session.flush()
        chapter = Chapter(
            work_id=work.id,
            episode_id=episode.id,
            title="1장",
            order_index=0,
            body="본문",
            global_seq=1,
        )
        session.add(chapter)
        await session.flush()
        version = ChapterVersion(chapter_id=chapter.id, body="본문")
        session.add(version)
        await session.commit()
        chapter_id = chapter.id
        version_id = version.id

        await session.delete(chapter)
        await session.commit()

        version_result = await session.execute(
            select(ChapterVersion).where(ChapterVersion.id == version_id)
        )
        assert version_result.scalar_one_or_none() is None
        chapter_result = await session.execute(select(Chapter).where(Chapter.id == chapter_id))
        assert chapter_result.scalar_one_or_none() is None


async def test_version_requires_existing_chapter(work: Work) -> None:
    """존재하지 않는 chapter_id로는 버전을 넣을 수 없다 (FK 제약이 실제로 걸려 있는지 확인)."""
    async with AsyncSessionFactory() as session:
        session.add(ChapterVersion(chapter_id=uuid.uuid4(), body="본문"))
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
