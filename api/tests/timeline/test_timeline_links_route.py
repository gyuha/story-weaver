"""씬-엔티티 링크 HTTP 라우트 — 실 DB + 실 라우터 경로.

worldbible/manuscript 도메인의 실 DB e2e 패턴(서비스 fake override 없이
``get_current_user``만 override)을 따른다. 링크 생성(중복 시 idempotent),
목록, 삭제, 교차 테넌트 404(POST/GET/DELETE)를 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.router import router as manuscript_router
from domains.timeline.router import links_router as timeline_router
from domains.works.models import Work
from domains.worldbible.router import router as worldbible_router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리(cascade로 work도 삭제)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@timeline.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@timeline.test")
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
    app.include_router(manuscript_router, prefix="/api/v1")
    app.include_router(worldbible_router, prefix="/api/v1")
    app.include_router(timeline_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_scene(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        chapter = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters",
                json={"title": "1장", "orderIndex": 0},
            )
        ).json()
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters/{chapter['id']}/scenes",
            json={"orderIndex": 0, "body": "본문"},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_entity(
    app: FastAPI, owner: User, work_id: uuid.UUID, name: str = "김무사"
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": name, "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Create + idempotent duplicate
# ---------------------------------------------------------------------------


async def test_create_link(app: FastAPI, owner_work: Work, two_users: tuple[User, User]) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["workId"] == str(owner_work.id)
    assert body["sceneId"] == scene["id"]
    assert body["entityId"] == entity["id"]
    assert body["source"] == "author"


async def test_create_link_duplicate_is_idempotent(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        first = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )
        second = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")
    assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_links_returns_created(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity_a = await _create_entity(app, owner, owner_work.id, name="김무사")
    entity_b = await _create_entity(app, owner, owner_work.id, name="무영곡")

    async with _client_as(app, owner) as client:
        await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity_a["id"]},
        )
        await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity_b["id"]},
        )
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")

    assert resp.status_code == 200
    entity_ids = {link["entityId"] for link in resp.json()}
    assert entity_ids == {entity_a["id"], entity_b["id"]}


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_link(app: FastAPI, owner_work: Work, two_users: tuple[User, User]) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )
        resp = await client.delete(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links/{entity['id']}"
        )
    assert resp.status_code == 204

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")
    assert resp.json() == []


async def test_delete_link_not_found_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        resp = await client.delete(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links/{entity['id']}"
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Cross-tenant isolation — POST/GET/DELETE
# ---------------------------------------------------------------------------


async def test_create_link_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )
    assert resp.status_code == 404

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")
    assert resp.json() == []


async def test_list_links_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")
    assert resp.status_code == 404


async def test_delete_link_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links",
            json={"entityId": entity["id"]},
        )

    async with _client_as(app, intruder) as client:
        resp = await client.delete(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links/{entity['id']}"
        )
    assert resp.status_code == 404

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/links")
    assert len(resp.json()) == 1
