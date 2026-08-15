"""entity_images 테이블 + 마이그레이션 + 리포지토리 실 DB 테스트 (plan.md S2, TDD).

worldbible 도메인 test_worldbible_models.py / manuscript 도메인
test_manuscript_versions.py의 실 DB 테스트 패턴을 따른다 — 픽스처가 실
``AsyncSessionFactory``로 user→work→entity를 만들고, 종료 후 user 삭제로 cascade 정리.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.image_generation.models import EntityImage
from domains.image_generation.repository import EntityImageRepository
from domains.works.models import Work
from domains.worldbible.models import Entity, EntityType

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def entity() -> AsyncIterator[Entity]:
    """실 DB에 user→work→entity 1건을 만들고, 종료 후 user 삭제로 cascade 정리."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"entity-image-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.flush()
        card = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="김무사",
            summary="주인공",
            attributes={},
        )
        session.add(card)
        await session.commit()
        yield card
        await session.delete(user)  # cascade: user -> work -> entities -> entity_images
        await session.commit()


def _image(entity: Entity, *, is_primary: bool = False) -> EntityImage:
    return EntityImage(
        work_id=entity.work_id,
        entity_id=entity.id,
        file_path=f"{entity.work_id}/{entity.id}/{uuid.uuid4().hex}.jpg",
        template_id="ink_wash_character",
        extra_prompt="",
        final_prompt="a character portrait",
        is_primary=is_primary,
    )


# ---------------------------------------------------------------------------
# 마이그레이션 upgrade→downgrade 왕복
# ---------------------------------------------------------------------------


async def test_upgrade_downgrade_roundtrip_is_clean() -> None:
    """0005 downgrade가 테이블을 지우고, 재-upgrade가 다시 깨끗이 만든다."""
    async with engine.connect() as conn:
        exists_before = await conn.scalar(
            sa.text("SELECT to_regclass('entity_images') IS NOT NULL")
        )
        assert exists_before is True

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_ALEMBIC_INI))
    # 복원은 반드시 "head"로, 그리고 반드시 finally에서 한다. 하드코딩된 리비전으로
    # 되돌리면 **더 새 마이그레이션이 추가된 순간 이 테스트가 공유 DB를 그 시점에
    # 갇히게 만든다** — 0006(작품 화풍)이 들어오자 이 줄이 DB를 0005에 남겨
    # `works`를 만지는 이후 모든 테스트가 무너졌다(실측: 16 failed · 150 errors).
    try:
        command.downgrade(cfg, "0004_chapter_versions")
        async with engine.connect() as conn:
            exists_after_down = await conn.scalar(
                sa.text("SELECT to_regclass('entity_images') IS NOT NULL")
            )
            assert exists_after_down is False
    finally:
        command.upgrade(cfg, "head")
    async with engine.connect() as conn:
        exists_after_up = await conn.scalar(
            sa.text("SELECT to_regclass('entity_images') IS NOT NULL")
        )
        assert exists_after_up is True


# ---------------------------------------------------------------------------
# append 후 목록이 순서대로 나옴
# ---------------------------------------------------------------------------


async def test_list_for_entity_returns_appended_images_in_order(entity: Entity) -> None:
    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        first = await repo.add(_image(entity))
        second = await repo.add(_image(entity))
        await session.commit()

    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        images = await repo.list_for_entity(entity.work_id, entity.id)

    assert [img.id for img in images] == [first.id, second.id]


# ---------------------------------------------------------------------------
# 대표 이미지 최대 1장 — 부분 유니크 인덱스가 실제로 막는가
# ---------------------------------------------------------------------------


async def test_inserting_a_second_primary_image_violates_unique_index(entity: Entity) -> None:
    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        await repo.add(_image(entity, is_primary=True))
        await session.commit()

    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        with pytest.raises(IntegrityError):
            await repo.add(_image(entity, is_primary=True))
        await session.rollback()


async def test_dropping_the_partial_unique_index_lets_the_violation_through(
    entity: Entity,
) -> None:
    """방어 제거 테스트: 인덱스를 지우면 위 테스트가 확인하는 위반이 실제로 통과한다.

    부분 유니크 인덱스가 아니라 다른 무언가(예: ORM 레벨 우연)가 막고 있는 게 아님을
    확인한다 — 인덱스를 드롭한 이 테스트 안에서는 두 번째 대표 삽입이 성공해야 한다.
    """
    async with engine.begin() as conn:
        await conn.execute(sa.text("DROP INDEX ix_entity_images_primary"))
    try:
        async with AsyncSessionFactory() as session:
            repo = EntityImageRepository(session)
            await repo.add(_image(entity, is_primary=True))
            await repo.add(_image(entity, is_primary=True))
            await session.commit()

        async with AsyncSessionFactory() as session:
            repo = EntityImageRepository(session)
            images = await repo.list_for_entity(entity.work_id, entity.id)
        assert sum(1 for img in images if img.is_primary) == 2
    finally:
        # 인덱스를 복구하기 전에, 이 테스트가 일부러 만든 중복 대표를 먼저 없앤다 —
        # 중복이 남아 있으면 UNIQUE INDEX 생성 자체가 실패해 이후 테스트에 인덱스
        # 없는 상태를 남긴다.
        async with engine.begin() as conn:
            await conn.execute(
                sa.text("DELETE FROM entity_images WHERE entity_id = :entity_id AND is_primary"),
                {"entity_id": entity.id},
            )
            await conn.execute(
                sa.text(
                    "CREATE UNIQUE INDEX ix_entity_images_primary "
                    "ON entity_images (entity_id) WHERE is_primary"
                )
            )


# ---------------------------------------------------------------------------
# set_primary가 기존 대표를 내린다
# ---------------------------------------------------------------------------


async def test_set_primary_demotes_the_previous_primary(entity: Entity) -> None:
    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        old_primary = await repo.add(_image(entity, is_primary=True))
        new_image = await repo.add(_image(entity))
        await session.commit()

    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        updated = await repo.set_primary(entity.work_id, entity.id, new_image.id)
        await session.commit()

    assert updated is not None
    assert updated.is_primary is True

    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        images = {img.id: img for img in await repo.list_for_entity(entity.work_id, entity.id)}
    assert images[old_primary.id].is_primary is False
    assert images[new_image.id].is_primary is True


# ---------------------------------------------------------------------------
# 카드 삭제 시 CASCADE로 이미지 행이 사라짐
# ---------------------------------------------------------------------------


async def test_deleting_entity_cascades_to_its_images(entity: Entity) -> None:
    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        await repo.add(_image(entity))
        await session.commit()

    async with AsyncSessionFactory() as session:
        card = await session.get(Entity, entity.id)
        assert card is not None
        await session.delete(card)
        await session.commit()

    async with AsyncSessionFactory() as session:
        repo = EntityImageRepository(session)
        images = await repo.list_for_entity(entity.work_id, entity.id)
    assert images == []
