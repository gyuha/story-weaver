"""동적 업데이트 추출 엔드포인트 rate 게이트 테스트 (TDD, plan.md M4-S3).

``slowapi.Limiter``를 ``/extract-updates``에 적용해 사용자당 분당 상한
(``core.rate_limit.LLM_RATE_LIMIT``)을 넘으면 429를 반환하는지 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from core.rate_limit import LLM_RATE_LIMIT
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.dynamic_update.router import router as dynamic_update_router
from domains.dynamic_update.router.dynamic_update_router import _extraction_llm_client
from domains.manuscript.router import router as manuscript_router
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.worldbible.router import router as worldbible_router

_LIMIT_COUNT = int(LLM_RATE_LIMIT.split("/")[0])


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def owner() -> AsyncIterator[User]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"owner-{uuid.uuid4().hex}@dynupdate-rate.test")
        session.add(user)
        await session.commit()
        yield user
        await session.delete(user)
        await session.commit()


@pytest.fixture
async def owner_work(owner: User) -> Work:
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()
        return work


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(works_router, prefix="/api/v1")
    app.include_router(manuscript_router, prefix="/api/v1")
    app.include_router(worldbible_router, prefix="/api/v1")
    app.include_router(dynamic_update_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=5.0)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeLLMClient:
    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        return _FakeResponse("{}")


async def _create_chapter(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": "본문"},
        )
    assert resp.status_code == 201
    return resp.json()


async def test_requests_up_to_the_limit_all_succeed(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id)
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
            )
            assert resp.status_code == 200


async def test_exceeding_the_limit_returns_429(app: FastAPI, owner: User, owner_work: Work) -> None:
    """429 응답 자체의 상세 포맷(``Retry-After`` 헤더, 문구 wrap)은
    ``tests/test_rate_limit.py``에서 main.py와 동일한 앱 배선으로 확인한다 — 여기서는
    라우터에 데코레이터가 실제로 걸려 상한을 넘으면 차단되는지만 본다.
    """
    chapter = await _create_chapter(app, owner, owner_work.id)
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
            )
            assert resp.status_code == 200

        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 429
