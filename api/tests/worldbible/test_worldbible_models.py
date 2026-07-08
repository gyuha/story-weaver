"""worldbible 모델 실 DB 테스트 — 4개 entity_type 각 1건 insert 확인.

실 `core.database.AsyncSessionFactory`로 인물·장소·사건·아이템 엔티티 카드를 각
1건씩 insert한다(works 도메인 test_works_isolation.py / manuscript
test_manuscript_models.py의 실 DB 테스트 패턴을 따름). fixture teardown에서
user 삭제가 work→entities까지 FK cascade로 함께 지워야 성공하므로, cascade 동작도
암묵적으로 검증된다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.works.models import Work
from domains.worldbible.models import Entity, EntityType


@pytest.fixture
async def work() -> AsyncIterator[Work]:
    """실 DB에 사용자+작품 1건을 만들고, 종료 후 정리(cascade로 하위 entities까지 삭제)."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"worldbible-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        w = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(w)
        await session.commit()
        yield w
        await session.delete(user)  # cascade: user -> work -> entities
        await session.commit()


async def test_insert_one_entity_per_type(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        character = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="김무사",
            aliases=["무사"],
            summary="주인공의 스승",
            attributes={
                "appearance": "백발의 노인",
                "personality": "과묵함",
                "speech_style": "하오체",
                "sample_lines": ["그리 하시게."],
                "relations": [],
            },
        )
        location = Entity(
            work_id=work.id,
            entity_type=EntityType.location,
            name="무영곡",
            aliases=[],
            summary="주인공의 은신처",
            attributes={"description": "깊은 계곡", "region": "북부", "atmosphere": "음습함"},
        )
        event = Entity(
            work_id=work.id,
            entity_type=EntityType.event,
            name="무영곡 전투",
            aliases=[],
            summary="세력 다툼의 시발점",
            attributes={"description": "야습", "participants": [], "occurred_at_scene": None},
        )
        item = Entity(
            work_id=work.id,
            entity_type=EntityType.item,
            name="흑룡검",
            aliases=["흑검"],
            summary="주인공의 애병",
            attributes={"description": "칠흑의 검", "owner": None, "properties": "화속성 부여"},
        )
        session.add_all([character, location, event, item])
        await session.commit()

        assert character.id is not None
        assert location.id is not None
        assert event.id is not None
        assert item.id is not None
        assert character.entity_type is EntityType.character
        assert item.entity_type is EntityType.item
