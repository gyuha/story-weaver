"""부/챕터 순서 변경(reorder) — order_index 재부여 + 영향받는 챕터 global_seq 재계산.

v2-A Plot Architect S1(.forge/branch/feat/web-topbar-landing-nav/plan.md). 트리뷰 DnD(S2,
web)가 호출할 API의 서버측 계약만 다룬다. `test_manuscript_route.py`/
`test_manuscript_isolation.py`와 동일한 실 DB e2e 패턴(인증만 override).
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
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@manuscript-reorder.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@manuscript-reorder.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def owner_work(two_users: tuple[User, User]) -> Work:
    owner, _ = two_users
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
    app.include_router(router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_episode(
    app: FastAPI, owner: User, work_id: uuid.UUID, title: str, order_index: int
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes",
            json={"title": title, "orderIndex": order_index},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_chapter(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    title: str,
    order_index: int,
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters",
            json={"title": title, "orderIndex": order_index},
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Episode reorder
# ---------------------------------------------------------------------------


async def test_reorder_episodes_updates_order_index(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    ep1 = await _create_episode(app, owner, owner_work.id, "1부", 0)
    ep2 = await _create_episode(app, owner, owner_work.id, "2부", 1)
    ep3 = await _create_episode(app, owner, owner_work.id, "3부", 2)

    new_order = [ep3["id"], ep1["id"], ep2["id"]]
    async with _client_as(app, owner) as client:
        resp = await client.patch(f"/api/v1/works/{owner_work.id}/episodes/reorder", json=new_order)
    assert resp.status_code == 200
    body = resp.json()
    assert [e["id"] for e in body] == new_order
    assert [e["orderIndex"] for e in body] == [0, 1, 2]

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/episodes")
    assert [e["id"] for e in resp.json()] == new_order


async def test_reorder_episodes_recomputes_global_seq(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    ep1 = await _create_episode(app, owner, owner_work.id, "1부", 0)
    ep1_id = uuid.UUID(str(ep1["id"]))
    ch1 = await _create_chapter(app, owner, owner_work.id, ep1_id, "1장", 0)

    ep2 = await _create_episode(app, owner, owner_work.id, "2부", 1)
    ep2_id = uuid.UUID(str(ep2["id"]))
    ch2 = await _create_chapter(app, owner, owner_work.id, ep2_id, "2장", 0)

    assert ch1["globalSeq"] == 1
    assert ch2["globalSeq"] == 2

    # 2부를 1부보다 앞으로 이동 → ch2가 ch1보다 먼저 와야 한다.
    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/reorder",
            json=[str(ep2_id), str(ep1_id)],
        )
    assert resp.status_code == 200

    async with _client_as(app, owner) as client:
        r1 = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{ep1_id}/chapters/{ch1['id']}"
        )
        r2 = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{ep2_id}/chapters/{ch2['id']}"
        )
    assert r2.json()["globalSeq"] < r1.json()["globalSeq"]
    assert [r2.json()["globalSeq"], r1.json()["globalSeq"]] == [1, 2]


async def test_reorder_episodes_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    ep1 = await _create_episode(app, owner, owner_work.id, "1부", 0)
    ep2 = await _create_episode(app, owner, owner_work.id, "2부", 1)

    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/reorder",
            json=[ep2["id"], ep1["id"]],
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Chapter reorder
# ---------------------------------------------------------------------------


async def test_reorder_chapters_updates_order_index(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id, "1부", 0)
    episode_id = uuid.UUID(str(episode["id"]))
    ch1 = await _create_chapter(app, owner, owner_work.id, episode_id, "1장", 0)
    ch2 = await _create_chapter(app, owner, owner_work.id, episode_id, "2장", 1)

    new_order = [ch2["id"], ch1["id"]]
    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/reorder",
            json=new_order,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert [c["id"] for c in body] == new_order
    assert [c["orderIndex"] for c in body] == [0, 1]

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters")
    assert [c["id"] for c in resp.json()] == new_order


async def test_reorder_chapters_recomputes_global_seq(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id, "1부", 0)
    episode_id = uuid.UUID(str(episode["id"]))
    ch1 = await _create_chapter(app, owner, owner_work.id, episode_id, "1장", 0)
    ch1_id = uuid.UUID(str(ch1["id"]))
    ch2 = await _create_chapter(app, owner, owner_work.id, episode_id, "2장", 1)
    ch2_id = uuid.UUID(str(ch2["id"]))

    assert ch1["globalSeq"] == 1
    assert ch2["globalSeq"] == 2

    # 2장을 1장보다 앞으로 이동 → ch2가 ch1보다 먼저 와야 한다.
    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/reorder",
            json=[str(ch2_id), str(ch1_id)],
        )
    assert resp.status_code == 200

    async with _client_as(app, owner) as client:
        r1 = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{ch1_id}"
        )
        r2 = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{ch2_id}"
        )
    assert [r2.json()["globalSeq"], r1.json()["globalSeq"]] == [1, 2]


async def test_reorder_chapters_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    episode = await _create_episode(app, owner, owner_work.id, "1부", 0)
    episode_id = uuid.UUID(str(episode["id"]))
    ch1 = await _create_chapter(app, owner, owner_work.id, episode_id, "1장", 0)
    ch2 = await _create_chapter(app, owner, owner_work.id, episode_id, "2장", 1)

    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/reorder",
            json=[ch2["id"], ch1["id"]],
        )
    assert resp.status_code == 404
