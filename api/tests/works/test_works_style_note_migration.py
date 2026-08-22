"""works.style_note 컬럼 + 마이그레이션 실 DB 테스트 (plan.md S1, TDD).

test_works_art_style_migration.py의 실 DB 마이그레이션 테스트 패턴을 따른다 —
픽스처가 실 ``AsyncSessionFactory``로 user→work를 만들고, 종료 후 user 삭제로
cascade 정리.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import sqlalchemy as sa

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.works.models import Work

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

_COLUMN_COUNT_SQL = sa.text(
    "SELECT count(*) FROM information_schema.columns "
    "WHERE table_name = 'works' AND column_name = 'style_note'"
)


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def work() -> AsyncIterator[Work]:
    """실 DB에 user→work 1건을 만들고, 종료 후 user 삭제로 cascade 정리."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"work-style-note-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        w = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(w)
        await session.commit()
        yield w
        await session.delete(user)
        await session.commit()


async def test_upgrade_downgrade_roundtrip_is_clean() -> None:
    """0007 downgrade가 컬럼을 지우고, 재-upgrade가 다시 깨끗이 만든다.

    **downgrade 뒤의 단정은 반드시 ``try``/``finally`` 안에 둔다.** 이 테스트는 개발용
    공유 DB에 실제 downgrade를 수행하므로, 단정이 실패하거나 중단되면 re-upgrade가
    실행되지 않고 DB가 0006에 갇힌다 — 그러면 ``works``를 만지는 이후 모든 테스트가
    ``column "style_note" does not exist``로 무너진다(task 80 실측: 16 failed · 150
    errors, 이번 슬라이스에도 동일 규약 적용).
    """
    async with engine.connect() as conn:
        assert await conn.scalar(_COLUMN_COUNT_SQL) == 1

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_ALEMBIC_INI))
    try:
        command.downgrade(cfg, "0006_work_art_style")
        async with engine.connect() as conn:
            assert await conn.scalar(_COLUMN_COUNT_SQL) == 0
    finally:
        command.upgrade(cfg, "head")

    async with engine.connect() as conn:
        assert await conn.scalar(_COLUMN_COUNT_SQL) == 1


async def test_existing_work_stays_null_across_migration_roundtrip(work: Work) -> None:
    """마이그레이션이 기존 작품에 기본값을 채우지 않는다(ADR 260813-110724).

    다운그레이드로 컬럼을 지웠다가 다시 업그레이드해도, 마이그레이션 이전부터 있던
    행은 ``style_note``가 NULL로 남아야 한다 — 업그레이드가 기본값을 백필하면 이
    테스트가 red가 된다.
    """
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_ALEMBIC_INI))
    try:
        command.downgrade(cfg, "0006_work_art_style")
    finally:
        # 위 테스트와 같은 이유 — 공유 DB를 0006에 갇히게 두지 않는다.
        command.upgrade(cfg, "head")

    async with AsyncSessionFactory() as session:
        refreshed = await session.get(Work, work.id)
        assert refreshed is not None
        assert refreshed.style_note is None


async def test_setting_and_reading_back_style_note_round_trips(work: Work) -> None:
    async with AsyncSessionFactory() as session:
        w = await session.get(Work, work.id)
        assert w is not None
        w.style_note = "대사는 짧게, 지문은 감정보다 행동 위주로."
        await session.commit()

    async with AsyncSessionFactory() as session:
        refreshed = await session.get(Work, work.id)
        assert refreshed is not None
        assert refreshed.style_note == "대사는 짧게, 지문은 감정보다 행동 위주로."
