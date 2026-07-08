"""시놉시스 HTTP 라우트 — 실 DB + 실 HTTP 경로로 create/read/upsert/cross-tenant 404 검증.

`test_works_isolation.py`의 실 DB e2e 패턴을 그대로 따른다: 서비스는 fake로 override하지
않고 실 `ManuscriptService`/`WorksService`를 그대로 태워 소유권 체크까지 함께 확인한다.
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
from domains.manuscript.router import router
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users_with_work() -> AsyncIterator[tuple[User, User, Work]]:
    """실 DB에 계정 A·B와 A 소유 작품 1건을 만들고, 종료 후 정리(cascade)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@synopsis.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@synopsis.test")
        session.add_all([owner, intruder])
        await session.flush()
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()
        yield owner, intruder, work
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_get_synopsis_404_when_none_yet(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, _intruder, work = two_users_with_work
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/synopsis")
    assert resp.status_code == 404


async def test_put_synopsis_creates(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, _intruder, work = two_users_with_work
    async with _client_as(app, owner) as client:
        resp = await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "초안 요약"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["body"] == "초안 요약"
    assert body["workId"] == str(work.id)


async def test_get_synopsis_after_create_returns_body(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, _intruder, work = two_users_with_work
    async with _client_as(app, owner) as client:
        await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "초안 요약"})
        resp = await client.get(f"/api/v1/works/{work.id}/synopsis")
    assert resp.status_code == 200
    assert resp.json()["body"] == "초안 요약"


async def test_put_synopsis_upsert_replaces_existing_body(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, _intruder, work = two_users_with_work
    async with _client_as(app, owner) as client:
        first = await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "초안 요약"})
        second = await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "수정된 요약"})
        resp = await client.get(f"/api/v1/works/{work.id}/synopsis")
    assert first.json()["id"] == second.json()["id"]  # 같은 행을 치환(신규 행 아님)
    assert second.json()["body"] == "수정된 요약"
    assert resp.json()["body"] == "수정된 요약"


async def test_get_synopsis_other_tenant_returns_404(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, intruder, work = two_users_with_work
    async with _client_as(app, owner) as client:
        await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "초안 요약"})

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/synopsis")
    assert resp.status_code == 404


async def test_put_synopsis_other_tenant_returns_404(
    app: FastAPI, two_users_with_work: tuple[User, User, Work]
) -> None:
    owner, intruder, work = two_users_with_work

    async with _client_as(app, intruder) as client:
        resp = await client.put(f"/api/v1/works/{work.id}/synopsis", json={"body": "가로채기"})
    assert resp.status_code == 404

    # 침입자의 시도로 시놉시스가 생성되지 않았음을 소유자 시점에서 함께 확인
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/synopsis")
    assert resp.status_code == 404
