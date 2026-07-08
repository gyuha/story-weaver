"""엔티티 카드(World Bible) HTTP 라우트 — 실 DB + 실 라우터 경로.

works/manuscript 도메인의 실 DB e2e 패턴(서비스 fake override 없이 `get_current_user`만
override)을 따른다. CRUD 계약(camelCase, 상태 코드), 타입별 attributes 검증 거부,
entity_type 불변(PATCH로 변경 불가 — 웹 mock ``updateEntity``의 "type은 변경 불가" 규칙과
동일), 교차 테넌트 404(GET/PATCH/DELETE)를 확인한다.
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
from domains.works.models import Work
from domains.worldbible.router import router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리(cascade로 work도 삭제)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@worldbible.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@worldbible.test")
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


async def _create_entity(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    entity_type: str,
    name: str = "김무사",
    attributes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": entity_type, "name": name, "attributes": attributes or {}},
        )
    assert resp.status_code == 201
    return resp.json()


_VALID_ATTRIBUTES: dict[str, dict[str, Any]] = {
    "character": {
        "appearance": "백발의 노인",
        "personality": "과묵함",
        "speech_style": "하오체",
        "sample_lines": ["그리 하시게."],
        "relations": [],
    },
    "location": {"description": "깊은 계곡", "region": "북부", "atmosphere": "음습함"},
    "event": {"description": "야습", "participants": [], "occurred_at_scene": None},
    "item": {"description": "칠흑의 검", "owner": None, "properties": "화속성 부여"},
}


# ---------------------------------------------------------------------------
# Create (4 types) + attribute validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("entity_type", ["character", "location", "event", "item"])
async def test_create_entity_with_valid_attributes_per_type(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User], entity_type: str
) -> None:
    owner, _ = two_users
    body = await _create_entity(
        app, owner, owner_work.id, entity_type, attributes=_VALID_ATTRIBUTES[entity_type]
    )
    assert body["entityType"] == entity_type
    assert body["workId"] == str(owner_work.id)
    assert body["name"] == "김무사"
    assert body["aliases"] == []
    assert "id" in body and "createdAt" in body and "updatedAt" in body


async def test_create_entity_rejects_invalid_attributes_for_type(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/entities",
            json={
                "entityType": "location",
                "name": "무영곡",
                # character 전용 필드를 location에 섞음 — 타입 불일치로 거부되어야 함
                "attributes": {"appearance": "백발의 노인"},
            },
        )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# List / Get
# ---------------------------------------------------------------------------


async def test_list_entities_returns_created(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    await _create_entity(app, owner, owner_work.id, "character", name="김무사")
    await _create_entity(app, owner, owner_work.id, "location", name="무영곡")

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities")
    assert resp.status_code == 200
    names = {e["name"] for e in resp.json()}
    assert names == {"김무사", "무영곡"}


async def test_get_entity(app: FastAPI, owner_work: Work, two_users: tuple[User, User]) -> None:
    owner, _ = two_users
    entity = await _create_entity(app, owner, owner_work.id, "item", name="흑룡검")

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "흑룡검"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


async def test_update_entity_updates_fields(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    entity = await _create_entity(app, owner, owner_work.id, "location", name="무영곡")

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}",
            json={
                "name": "개정 무영곡",
                "aliases": ["숨은 계곡"],
                "summary": "수정된 요약",
                "attributes": {"description": "개정됨", "region": "남부", "atmosphere": "고요함"},
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "개정 무영곡"
    assert body["aliases"] == ["숨은 계곡"]
    assert body["summary"] == "수정된 요약"
    assert body["attributes"]["region"] == "남부"


async def test_update_entity_rejects_invalid_attributes(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    entity = await _create_entity(app, owner, owner_work.id, "item", name="흑룡검")

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}",
            json={"attributes": {"unknown_field": "x"}},
        )
    assert resp.status_code == 422


async def test_update_entity_ignores_entity_type_change(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """entity_type은 생성 후 불변 — PATCH 페이로드에 담겨도 무시된다."""
    owner, _ = two_users
    entity = await _create_entity(app, owner, owner_work.id, "character", name="김무사")

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}",
            json={"entityType": "location", "name": "개정 김무사"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entityType"] == "character"
    assert body["name"] == "개정 김무사"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_entity(app: FastAPI, owner_work: Work, two_users: tuple[User, User]) -> None:
    owner, _ = two_users
    entity = await _create_entity(app, owner, owner_work.id, "event", name="무영곡 전투")

    async with _client_as(app, owner) as client:
        resp = await client.delete(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 204

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Cross-tenant isolation — GET/PATCH/DELETE
# ---------------------------------------------------------------------------


async def test_get_entity_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    entity = await _create_entity(app, owner, owner_work.id, "character")

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 404


async def test_update_entity_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    entity = await _create_entity(app, owner, owner_work.id, "character")

    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}",
            json={"name": "가로채기"},
        )
    assert resp.status_code == 404

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] != "가로채기"


async def test_delete_entity_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    entity = await _create_entity(app, owner, owner_work.id, "character")

    async with _client_as(app, intruder) as client:
        resp = await client.delete(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 404

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{entity['id']}")
    assert resp.status_code == 200
