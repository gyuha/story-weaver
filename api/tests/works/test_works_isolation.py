"""Cross-tenant 격리 통합 테스트 — 실 DB + 실 HTTP 라우트 경로.

`test_works_route.py`는 서비스를 fake로 override해 격리 로직 자체를 거치지 않는다.
이 파일은 실 `WorksService`/`WorksRepository`/`get_async_session`을 그대로 태워 계정 A가
만든 work를 계정 B로 조회/수정/삭제하면 실제로 404가 나는지 확인한다(architecture.md 6.2).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.works.router import router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    """pytest-asyncio는 테스트마다 새 이벤트 루프를 쓰지만 `core.database.engine`은
    모듈 임포트 시 한 번만 만들어진다 — 풀에 남은 커넥션이 이전 루프에 묶여 있으면
    다음 테스트에서 깨진다. 각 테스트 뒤 풀을 비워 다음 테스트가 새 루프에서 새
    커넥션을 열게 한다."""
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A·B를 만들고, 테스트 종료 후 정리(cascade로 work도 함께 삭제)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@isolation.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@isolation.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
def app_for(two_users: tuple[User, User]) -> tuple[FastAPI, User, User]:
    owner, intruder = two_users
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app, owner, intruder


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_work_as_owner(app: FastAPI, owner: User) -> str:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            "/api/v1/works",
            json={"title": "회귀한 무사", "genre": "무협", "keywords": ["회귀"], "style": "간결체"},
        )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_get_work_other_tenant_returns_404(
    app_for: tuple[FastAPI, User, User],
) -> None:
    app, owner, intruder = app_for
    work_id = await _create_work_as_owner(app, owner)

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{work_id}")
    assert resp.status_code == 404


async def test_update_work_other_tenant_returns_404(
    app_for: tuple[FastAPI, User, User],
) -> None:
    app, owner, intruder = app_for
    work_id = await _create_work_as_owner(app, owner)

    async with _client_as(app, intruder) as client:
        resp = await client.patch(f"/api/v1/works/{work_id}", json={"title": "가로채기"})
    assert resp.status_code == 404


async def test_delete_work_other_tenant_returns_404(
    app_for: tuple[FastAPI, User, User],
) -> None:
    app, owner, intruder = app_for
    work_id = await _create_work_as_owner(app, owner)

    async with _client_as(app, intruder) as client:
        resp = await client.delete(f"/api/v1/works/{work_id}")
    assert resp.status_code == 404

    # 삭제되지 않고 소유자에게는 여전히 조회됨을 함께 확인 — 404가 "삭제됨"이 아니라
    # "권한 없음"임을 증명한다.
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work_id}")
    assert resp.status_code == 200
