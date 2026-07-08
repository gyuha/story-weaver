"""manuscript 모델 실 DB 테스트 — 4개 테이블 insert + FK cascade 확인.

실 `core.database.AsyncSessionFactory`로 시놉시스·부(episode)·챕터·씬을 각 1건씩
insert하고, 부 삭제가 챕터(그리고 그 아래 씬)까지 DB FK cascade로 지워지는지 확인한다
(works 도메인 test_works_isolation.py의 실 DB 테스트 패턴을 따름).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.manuscript.models import Chapter, Episode, Scene, Synopsis
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
        await session.delete(user)  # cascade: user -> work -> synopsis/episodes/chapters/scenes
        await session.commit()


async def test_insert_one_row_per_table(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        synopsis = Synopsis(work_id=work.id, body="요약")
        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add_all([synopsis, episode])
        await session.flush()

        chapter = Chapter(work_id=work.id, episode_id=episode.id, title="1장", order_index=0)
        session.add(chapter)
        await session.flush()

        scene = Scene(
            work_id=work.id, chapter_id=chapter.id, order_index=0, global_seq=1, body="본문"
        )
        session.add(scene)
        await session.commit()

        assert synopsis.id is not None
        assert episode.id is not None
        assert chapter.id is not None
        assert scene.id is not None


async def test_delete_episode_cascades_chapters_and_scenes(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add(episode)
        await session.flush()
        chapter = Chapter(work_id=work.id, episode_id=episode.id, title="1장", order_index=0)
        session.add(chapter)
        await session.flush()
        scene = Scene(
            work_id=work.id, chapter_id=chapter.id, order_index=0, global_seq=1, body="본문"
        )
        session.add(scene)
        await session.commit()
        chapter_id, scene_id = chapter.id, scene.id

        await session.delete(episode)
        await session.commit()

        chapter_result = await session.execute(select(Chapter).where(Chapter.id == chapter_id))
        assert chapter_result.scalar_one_or_none() is None

        scene_result = await session.execute(select(Scene).where(Scene.id == scene_id))
        assert scene_result.scalar_one_or_none() is None
