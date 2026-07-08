"""memory 모델 실 DB 테스트 — 384차원 벡터 1건 insert 후 재조회해 차원 보존을 확인.

실 `core.database.AsyncSessionFactory`로 `Embedding` 1건을 insert하고 다시 읽어와
`embedding` 컬럼이 원래 넣은 384차원 벡터를 그대로 보존하는지 확인한다
(timeline/worldbible 도메인의 실 DB 테스트 패턴을 따름). FK를 만족시키기 위해 최소
User/Work 행만 직접 생성한다(source_id는 폴리모픽이라 FK가 없어 entity/scene 행은
필요 없음).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest

from core.database import AsyncSessionFactory
from domains.auth.models import User
from domains.memory.models import EMBEDDING_DIM, Embedding, EmbeddingSourceType
from domains.works.models import Work


class _Fixture:
    def __init__(self, work: Work) -> None:
        self.work = work


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    """실 DB에 user→work를 1건 만들고 정리."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"memory-{uuid.uuid4().hex}@isolation.test")
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


async def test_insert_and_read_back_embedding_preserves_dimension(fixture: _Fixture) -> None:
    vector = [0.1] * EMBEDDING_DIM
    entity_id = uuid.uuid4()

    async with AsyncSessionFactory() as session:
        row = Embedding(
            work_id=fixture.work.id,
            source_type=EmbeddingSourceType.entity,
            source_id=entity_id,
            chunk_index=0,
            embedding=vector,
            content="김무사는 주인공의 스승이다.",
        )
        session.add(row)
        await session.commit()
        row_id = row.id

    async with AsyncSessionFactory() as session:
        fetched = await session.get(Embedding, row_id)
        assert fetched is not None
        assert len(fetched.embedding) == EMBEDDING_DIM
        assert list(fetched.embedding) == pytest.approx(vector)
