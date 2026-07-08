"""timeline 모델 실 DB 테스트 — 1건씩 insert + scene_entity_links UNIQUE 제약 확인.

실 `core.database.AsyncSessionFactory`로 타임라인 상태·씬-엔티티 링크를 각 1건씩
insert하고, ``scene_entity_links``의 UNIQUE(scene_id, entity_id) 제약이 중복 insert를
거부하는지 확인한다(works/manuscript/worldbible 도메인의 실 DB 테스트 패턴을 따름).
FK를 만족시키기 위해 최소 Work/Episode/Chapter/Scene/Entity 행을 직접 생성한다(각
도메인의 HTTP 라우트를 거치지 않음).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.exc import IntegrityError

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.manuscript.models import Chapter, Episode, Scene
from domains.timeline.models import (
    SceneEntityLink,
    SceneEntityLinkSource,
    TimelineState,
    TimelineStateSource,
)
from domains.works.models import Work
from domains.worldbible.models import Entity, EntityType


class _Fixture:
    def __init__(self, work: Work, scene: Scene, entity: Entity) -> None:
        self.work = work
        self.scene = scene
        self.entity = entity


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    """실 DB에 user→work→episode→chapter→scene, work→entity를 각 1건씩 만들고 정리."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"timeline-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()

        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.flush()

        episode = Episode(work_id=work.id, title="1부", order_index=0)
        session.add(episode)
        await session.flush()

        chapter = Chapter(work_id=work.id, episode_id=episode.id, title="1장", order_index=0)
        session.add(chapter)
        await session.flush()

        scene = Scene(
            work_id=work.id, chapter_id=chapter.id, order_index=0, global_seq=1, body="본문"
        )
        entity = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="김무사",
            aliases=[],
            summary="주인공의 스승",
            attributes={},
        )
        session.add_all([scene, entity])
        await session.commit()

        yield _Fixture(work=work, scene=scene, entity=entity)

        await session.delete(user)  # cascade: user -> work -> .../entities/timeline_states/links
        await session.commit()


async def test_insert_one_timeline_state_and_link(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        state = TimelineState(
            work_id=fixture.work.id,
            entity_id=fixture.entity.id,
            scene_id=fixture.scene.id,
            state_key="life_status",
            state_value="dead",
            note="3화에서 사망",
            source=TimelineStateSource.author,
        )
        link = SceneEntityLink(
            work_id=fixture.work.id,
            scene_id=fixture.scene.id,
            entity_id=fixture.entity.id,
            source=SceneEntityLinkSource.author,
        )
        session.add_all([state, link])
        await session.commit()

        assert state.id is not None
        assert link.id is not None


async def test_duplicate_scene_entity_link_rejected(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        session.add(
            SceneEntityLink(
                work_id=fixture.work.id,
                scene_id=fixture.scene.id,
                entity_id=fixture.entity.id,
                source=SceneEntityLinkSource.author,
            )
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        session.add(
            SceneEntityLink(
                work_id=fixture.work.id,
                scene_id=fixture.scene.id,
                entity_id=fixture.entity.id,
                source=SceneEntityLinkSource.author,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
