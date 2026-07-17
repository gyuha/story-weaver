"""메모리 검색 API 격리 테스트 (plan.md S5, 2/2 — S4에 의존).

``GET /api/v1/works/{work_id}/chapters/{chapter_id}/memory``(S4, 동시 진행 중인 형제
작업)가 실제로 work_id로 벡터 검색을 필터링해 타 작품의 데이터를 새지 않게 하는지 HTTP
e2e로 확인한다. S4가 아직 랜딩되지 않았다면 이 테스트는 (의도적으로) 실패한다 — S4
완성 기준 문구("벡터 검색에 work_id 필터가 없으면 격리 테스트가 실패함을 먼저 확인")가
요구하는 그 실패다. S4가 랜딩되면 코드 변경 없이 그대로 통과해야 한다.
"""

from __future__ import annotations

import importlib
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import ChapterCreate, EpisodeCreate
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.models import EntityType
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.schemas import EntityCreate
from domains.worldbible.service import WorldBibleService

# eco: S4(동시 진행 중인 형제 작업)가 아직 랜딩되지 않았을 수 있어 동적 import로 로드한다
# — 정적 import는 모듈이 없거나 아직 ``router`` 속성이 없을 때 mypy 에러 코드가
# import-not-found → attr-defined로 계속 바뀌어 type: ignore 주석이 매번 깨진다.
# getattr(..., "router", None)은 두 경우 모두 None으로 안전하게 처리되고, S4가 완전히
# 랜딩되면 코드 변경 없이 실제 라우터를 그대로 집어온다.
try:
    memory_router: Any = getattr(importlib.import_module("domains.memory.router"), "router", None)
except ImportError:
    memory_router = None  # domains.memory.router 자체가 없음(S4 착수 전)

# 두 작품에 동일하게 심어 ANN 유사도를 강제로 높인다 — work_id 필터가 없으면 이 문구가
# 작품 B → 작품 A의 검색 결과로 새기 쉬운 상태를 만든다.
_LEAK_PHRASE = "달빛 아래 용을 벤 검객"


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
def app() -> FastAPI:
    if memory_router is None:
        pytest.fail(
            "domains.memory.router가 아직 없음 — S4(메모리 검색 API)가 랜딩되면 "
            "이 테스트가 통과해야 한다 (plan.md S4)."
        )
    application = FastAPI()
    application.include_router(memory_router, prefix="/api/v1")
    return application


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
async def chapter_with_marker_leak() -> AsyncIterator[tuple[User, Work, uuid.UUID, str]]:
    """작품 A(소유자 owner_a)에 ``_LEAK_PHRASE``를 본문으로 한 화 하나, 작품 B(다른
    소유자 owner_b)에 같은 문구 + 고유 마커를 summary로 가진 엔티티 하나를 만든다."""
    marker = f"LEAK-MARKER-{uuid.uuid4().hex}"
    async with AsyncSessionFactory() as session:
        owner_a = User(email=f"owner-a-{uuid.uuid4().hex}@memsearch.test")
        owner_b = User(email=f"owner-b-{uuid.uuid4().hex}@memsearch.test")
        session.add_all([owner_a, owner_b])
        await session.flush()
        work_a = Work(
            user_id=owner_a.id, title="작품 A", short_label="A", genre="무협", style="간결체"
        )
        work_b = Work(
            user_id=owner_b.id, title="작품 B", short_label="B", genre="무협", style="간결체"
        )
        session.add_all([work_a, work_b])
        await session.flush()

        works_service = WorksService(WorksRepository(session))
        memory_service = MemoryService(MemoryRepository(session))

        manuscript_service = ManuscriptService(
            ManuscriptRepository(session), works_service, memory_service
        )
        episode = await manuscript_service.create_episode(
            work_a.id, owner_a.id, EpisodeCreate(title="1부", order_index=0)
        )
        chapter = await manuscript_service.create_chapter(
            work_a.id,
            owner_a.id,
            episode.id,
            ChapterCreate(title="1장", order_index=0, body=_LEAK_PHRASE),
        )

        worldbible_service = WorldBibleService(
            WorldBibleRepository(session), works_service, memory_service
        )
        await worldbible_service.create_entity(
            work_b.id,
            owner_b.id,
            EntityCreate(
                entity_type=EntityType.character,
                name="타 작품 인물",
                summary=f"{_LEAK_PHRASE} - {marker}",
            ),
        )

        await session.commit()
        yield owner_a, work_a, chapter.id, marker

        await session.delete(owner_a)  # cascade: user -> work -> chapters/entities/embeddings
        await session.delete(owner_b)
        await session.commit()


async def test_memory_search_never_leaks_other_work_data(
    app: FastAPI, chapter_with_marker_leak: tuple[User, Work, uuid.UUID, str]
) -> None:
    owner_a, work_a, chapter_id, marker = chapter_with_marker_leak

    async with _client_as(app, owner_a) as client:
        resp = await client.get(f"/api/v1/works/{work_a.id}/chapters/{chapter_id}/memory")

    assert resp.status_code == 200
    assert marker not in resp.text  # 작품 B의 데이터가 절대 새지 않아야 함
