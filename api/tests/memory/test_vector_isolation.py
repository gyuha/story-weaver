"""벡터 격리 회귀 가드 테스트 (plan.md S5, 1/2).

work_id 필터가 없는 pgvector ANN 쿼리가 실제로 타 작품(테넌트)의 벡터를 반환할 수
있는지 raw SQLAlchemy 쿼리로 직접 증명한다 — 아직 없는 앱 코드(S4 검색 API)를
테스트하는 게 아니라, "필터 누락은 위험하다"는 전제 자체가 사실인지 pgvector 수준에서
먼저 확인하는 데모/회귀가드 테스트다. S4가 이 위험을 실제로 막는지는
``test_memory_search_isolation.py``(HTTP e2e)에서 검증한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.works.models import Work

# 쿼리 컨텍스트 벡터 — 예: 작품 A의 현재 씬에서 뽑은 임베딩이라고 가정한다.
_QUERY_VECTOR = [1.0] + [0.0] * 383


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_works_with_embeddings() -> AsyncIterator[tuple[Work, Work]]:
    """작품 A(쿼리와 직각, 거리 있음)·B(쿼리와 완전히 일치, 거리 0)에 각각 임베딩
    1건씩. 필터 없이 최근접 이웃을 구하면 항상 B가 이긴다."""
    async with AsyncSessionFactory() as session:
        user = User(email=f"vec-iso-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        work_a = Work(
            user_id=user.id, title="작품 A", short_label="A", genre="무협", style="간결체"
        )
        work_b = Work(
            user_id=user.id, title="작품 B", short_label="B", genre="로맨스", style="담백체"
        )
        session.add_all([work_a, work_b])
        await session.flush()
        session.add(
            Embedding(
                work_id=work_a.id,
                source_type=EmbeddingSourceType.entity,
                source_id=uuid.uuid4(),
                embedding=[0.0, 1.0] + [0.0] * 382,  # 쿼리와 직각 → 거리 있음
                content="작품 A 자신의 엔티티",
            )
        )
        session.add(
            Embedding(
                work_id=work_b.id,
                source_type=EmbeddingSourceType.entity,
                source_id=uuid.uuid4(),
                embedding=_QUERY_VECTOR,  # 쿼리와 완전 일치 → 거리 0
                content="작품 B의 엔티티 (타 테넌트)",
            )
        )
        await session.commit()
        yield work_a, work_b
        await session.delete(user)  # cascade: user -> work -> embeddings
        await session.commit()


async def test_unfiltered_ann_query_can_leak_other_tenant_embedding(
    two_works_with_embeddings: tuple[Work, Work],
) -> None:
    """work_id 필터가 없는 코사인 거리 ANN 쿼리는, 작품 A 컨텍스트에서 실행해도 작품
    B의 벡터를 최근접 결과로 반환할 수 있다 — 필터 없는 쿼리가 실제로 위험함을
    증명한다."""
    work_a, work_b = two_works_with_embeddings

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(Embedding).order_by(Embedding.embedding.cosine_distance(_QUERY_VECTOR)).limit(1)
            # 의도적으로 .where(Embedding.work_id == work_a.id) 없음 — 이게 이 테스트의 요점.
        )
        nearest = result.scalar_one()

    assert nearest.work_id == work_b.id  # 작품 A 컨텍스트인데 작품 B의 벡터가 최근접으로 샘
    assert nearest.work_id != work_a.id
