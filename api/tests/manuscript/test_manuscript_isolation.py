"""교차 테넌트 격리 확인(S4) — 부/챕터의 PATCH·DELETE 404.

`test_works_isolation.py`의 실 DB e2e 패턴을 그대로 재사용한다: 서비스를 fake로
override하지 않고 실 라우터 → `ManuscriptService`/`WorksService` → 실 DB 경로를 그대로
태워 계정 A가 만든 리소스를 계정 B로 수정/삭제하면 실제로 404가 나는지 확인한다.

이미 충분히 커버되어 이 파일에서 중복하지 않는 것 (둘 다 실 DB 경로, 인증만 override):
- 시놉시스 GET/PUT 교차 테넌트 404 — `test_synopsis_route.py`의
  `test_get_synopsis_other_tenant_returns_404`, `test_put_synopsis_other_tenant_returns_404`.
- 부/챕터 GET 교차 테넌트 404 — `test_manuscript_route.py`의
  `test_get_episode_other_tenant_returns_404`, `test_get_chapter_other_tenant_returns_404`.

이 파일이 채우는 빈 칸: 부/챕터의 PATCH·DELETE 교차 테넌트 404 —
`test_works_isolation.py`가 work에 대해 커버하는 것과 대칭이며, 지금까지 어디에도 없었다.
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
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리(cascade로 work도 삭제)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@manuscript-isolation.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@manuscript-isolation.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
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


@pytest.fixture
async def owner_hierarchy(
    app: FastAPI, two_users: tuple[User, User]
) -> tuple[User, User, Work, dict[str, object], dict[str, object]]:
    """소유자(owner) 명의로 work → episode → chapter를 한 줄씩 만들어 반환."""
    owner, intruder = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()

    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work.id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        chapter = (
            await client.post(
                f"/api/v1/works/{work.id}/episodes/{episode['id']}/chapters",
                json={"title": "1장", "orderIndex": 0, "body": "본문"},
            )
        ).json()

    return owner, intruder, work, episode, chapter


_Hierarchy = tuple[User, User, Work, dict[str, object], dict[str, object]]


async def test_update_episode_other_tenant_returns_404(
    app: FastAPI, owner_hierarchy: _Hierarchy
) -> None:
    _owner, intruder, work, episode, _chapter = owner_hierarchy
    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/episodes/{episode['id']}", json={"title": "가로채기"}
        )
    assert resp.status_code == 404


async def test_delete_episode_other_tenant_returns_404(
    app: FastAPI, owner_hierarchy: _Hierarchy
) -> None:
    owner, intruder, work, episode, _chapter = owner_hierarchy
    async with _client_as(app, intruder) as client:
        resp = await client.delete(f"/api/v1/works/{work.id}/episodes/{episode['id']}")
    assert resp.status_code == 404

    # 404가 "삭제됨"이 아니라 "권한 없음"임을 소유자 시점에서 함께 확인
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/episodes/{episode['id']}")
    assert resp.status_code == 200


async def test_update_chapter_other_tenant_returns_404(
    app: FastAPI, owner_hierarchy: _Hierarchy
) -> None:
    _owner, intruder, work, episode, chapter = owner_hierarchy
    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/episodes/{episode['id']}/chapters/{chapter['id']}",
            json={"title": "가로채기"},
        )
    assert resp.status_code == 404


async def test_delete_chapter_other_tenant_returns_404(
    app: FastAPI, owner_hierarchy: _Hierarchy
) -> None:
    owner, intruder, work, episode, chapter = owner_hierarchy
    async with _client_as(app, intruder) as client:
        resp = await client.delete(
            f"/api/v1/works/{work.id}/episodes/{episode['id']}/chapters/{chapter['id']}"
        )
    assert resp.status_code == 404

    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{work.id}/episodes/{episode['id']}/chapters/{chapter['id']}"
        )
    assert resp.status_code == 200
