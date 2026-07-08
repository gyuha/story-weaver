"""엔티티 생성/수정 시 임베딩 인덱싱 연동 테스트 (TDD, plan.md S3).

``WorldBibleService.create_entity``/``update_entity``가 ``MemoryService``를 통해
엔티티 카드(summary+attributes)를 임베딩해 ``embeddings`` 테이블에 upsert하는지
확인한다 — 수정 시 새 행이 아니라 기존 행을 갱신해야 한다(중복 방지).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.models import EntityType
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.schemas import EntityCreate, EntityUpdate
from domains.worldbible.service import WorldBibleService


class _Fixture:
    def __init__(self, user: User, work: Work) -> None:
        self.user = user
        self.work = work


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"wb-index-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()
        yield _Fixture(user=user, work=work)
        await session.delete(user)  # cascade: user -> work -> entities/embeddings
        await session.commit()


def _service(session: AsyncSessionFactory) -> WorldBibleService:  # type: ignore[valid-type]
    return WorldBibleService(
        WorldBibleRepository(session),
        WorksService(WorksRepository(session)),
        MemoryService(MemoryRepository(session)),
    )


async def _embedding_rows(entity_id: uuid.UUID) -> list[Embedding]:
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(Embedding).where(
                Embedding.source_id == entity_id,
                Embedding.source_type == EmbeddingSourceType.entity,
            )
        )
        return list(result.scalars().all())


async def test_create_entity_indexes_embedding(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        entity = await _service(session).create_entity(
            fixture.work.id,
            fixture.user.id,
            EntityCreate(entity_type=EntityType.character, name="김무사", summary="주인공의 스승"),
        )
        await session.commit()
        entity_id = entity.id

    rows = await _embedding_rows(entity_id)
    assert len(rows) == 1
    assert "주인공의 스승" in rows[0].content


async def test_update_entity_reembeds_without_duplicating(fixture: _Fixture) -> None:
    async with AsyncSessionFactory() as session:
        entity = await _service(session).create_entity(
            fixture.work.id,
            fixture.user.id,
            EntityCreate(entity_type=EntityType.character, name="김무사", summary="주인공의 스승"),
        )
        await session.commit()
        entity_id = entity.id

    async with AsyncSessionFactory() as session:
        await _service(session).update_entity(
            fixture.work.id, fixture.user.id, entity_id, EntityUpdate(summary="사실은 배신자였다")
        )
        await session.commit()

    rows = await _embedding_rows(entity_id)
    assert len(rows) == 1  # 새 행이 아니라 기존 행 갱신
    assert "배신자" in rows[0].content
