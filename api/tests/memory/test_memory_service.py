"""MemoryService.index_source 실 DB 테스트 (TDD) — plan.md S3 인덱서.

content를 실제 로컬 임베딩 클라이언트로 임베딩해 ``embeddings`` 행을 upsert하는지
확인한다. 같은 ``source_id``(chunk_index=0 고정, 청킹은 비목표)로 두 번째 호출하면
새 행을 추가하는 대신 기존 행을 갱신해야 한다(중복 방지).

M4-S1(임베딩 캐싱) — 내용이 바뀌지 않았으면 ``embed_text``를 다시 호출하지 않는지,
내용이 바뀌면 다시 호출하는지를 fake ``embed_text``의 호출 횟수로 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

import domains.memory.service.memory_service as memory_service_module
from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.memory.embedding_client import EMBEDDING_DIM
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.models import Work


class _Fixture:
    def __init__(self, work: Work) -> None:
        self.work = work


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"memsvc-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()

        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()

        yield _Fixture(work=work)

        await session.delete(user)  # cascade: user -> work -> embeddings
        await session.commit()


async def test_index_source_creates_embedding_row(fixture: _Fixture) -> None:
    source_id = uuid.uuid4()
    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.entity, source_id, "김무사는 주인공의 스승이다."
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        result = await session.execute(select(Embedding).where(Embedding.source_id == source_id))
        rows = list(result.scalars().all())
        assert len(rows) == 1
        assert rows[0].content == "김무사는 주인공의 스승이다."
        assert len(rows[0].embedding) == EMBEDDING_DIM
        assert rows[0].chunk_index == 0


async def test_index_source_upserts_instead_of_duplicating(fixture: _Fixture) -> None:
    source_id = uuid.uuid4()
    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.scene, source_id, "첫 번째 본문"
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.scene, source_id, "수정된 본문"
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        result = await session.execute(select(Embedding).where(Embedding.source_id == source_id))
        rows = list(result.scalars().all())
        assert len(rows) == 1  # 새 행이 아니라 기존 행 갱신
        assert rows[0].content == "수정된 본문"


async def test_index_source_skips_reembedding_when_content_unchanged(
    fixture: _Fixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    source_id = uuid.uuid4()
    calls: list[str] = []

    def _fake_embed_text(text: str) -> list[float]:
        calls.append(text)
        return [0.0] * EMBEDDING_DIM

    monkeypatch.setattr(memory_service_module, "embed_text", _fake_embed_text)

    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.entity, source_id, "동일 내용"
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.entity, source_id, "동일 내용"
        )
        await session.commit()

    assert len(calls) == 1  # 두 번째 호출은 재임베딩 스킵


async def test_index_source_reembeds_when_content_changed(
    fixture: _Fixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    source_id = uuid.uuid4()
    calls: list[str] = []

    def _fake_embed_text(text: str) -> list[float]:
        calls.append(text)
        return [0.0] * EMBEDDING_DIM

    monkeypatch.setattr(memory_service_module, "embed_text", _fake_embed_text)

    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.entity, source_id, "원래 내용"
        )
        await session.commit()

    async with AsyncSessionFactory() as session:
        service = MemoryService(MemoryRepository(session))
        await service.index_source(
            fixture.work.id, EmbeddingSourceType.entity, source_id, "바뀐 내용"
        )
        await session.commit()

    assert len(calls) == 2  # 내용이 바뀌었으니 재임베딩
