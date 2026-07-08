"""타임라인 상태 HTTP 라우트 — 실 DB + 실 라우터 경로.

worldbible/manuscript 도메인의 실 DB e2e 패턴(서비스 fake override 없이 `get_current_user`만
override)을 따른다. 핵심 시나리오는 시점(global_seq) 기반 스포일러 방지 필터 — 미래 씬에서
기록된 상태가 `up_to_scene_id`로 과거 씬을 지정한 조회에 새지 않아야 한다(data-model.md 4장/
ai-pipeline.md 2.1). 그 외 필터 없는 생성/조회, 교차 테넌트 404를 확인한다.
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
from domains.timeline.router import router as timeline_router
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


async def _create_scene_chain(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    """부→챕터를 만들고 그 아래 씬 하나를 생성해 반환(global_seq는 작품 내 자동 증가)."""
    async with _client_as(app, owner) as client:
        episode = await client.post(
            f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
        )
        assert episode.status_code == 201
        chapter = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode.json()['id']}/chapters",
            json={"title": "1장", "orderIndex": 0},
        )
        assert chapter.status_code == 201
        scene = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode.json()['id']}/chapters/{chapter.json()['id']}/scenes",
            json={"orderIndex": 0, "body": "본문"},
        )
        assert scene.status_code == 201
        return scene.json()


async def _create_entity(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": "김무사", "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_timeline_state(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    entity_id: str,
    scene_id: str,
    state_key: str = "life_status",
    state_value: str = "alive",
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities/{entity_id}/timeline-states",
            json={"sceneId": scene_id, "stateKey": state_key, "stateValue": state_value},
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# 핵심 시나리오 — 시점(global_seq) 기반 스포일러 방지 필터
# ---------------------------------------------------------------------------


async def test_future_state_not_returned_when_queried_up_to_earlier_scene(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """씬1(과거)·씬2·씬3(최신) 순으로 만들고, 씬3에서 기록한 상태를
    ``up_to_scene_id=씬1``로 조회하면 새지 않아야 한다(핵심 시나리오)."""
    owner, _ = two_users
    scene1 = await _create_scene_chain(app, owner, owner_work.id)
    scene2 = await _create_scene_chain(app, owner, owner_work.id)
    scene3 = await _create_scene_chain(app, owner, owner_work.id)
    assert scene1["globalSeq"] < scene2["globalSeq"] < scene3["globalSeq"]

    entity = await _create_entity(app, owner, owner_work.id)
    await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], scene3["id"], state_value="dead"
    )

    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}/timeline-states",
            params={"up_to_scene_id": scene1["id"]},
        )
    assert resp.status_code == 200
    assert resp.json() == []  # 씬3(미래)에서 기록된 상태가 새지 않음


async def test_state_returned_when_queried_up_to_its_own_or_later_scene(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene1 = await _create_scene_chain(app, owner, owner_work.id)
    scene2 = await _create_scene_chain(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)
    state = await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], scene1["id"], state_value="dead"
    )

    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}/timeline-states",
            params={"up_to_scene_id": scene2["id"]},
        )
    assert resp.status_code == 200
    assert [s["id"] for s in resp.json()] == [state["id"]]


# ---------------------------------------------------------------------------
# 필터 없는 생성/조회
# ---------------------------------------------------------------------------


async def test_create_timeline_state(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene_chain(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    body = await _create_timeline_state(
        app,
        owner,
        owner_work.id,
        entity["id"],
        scene["id"],
        state_key="location",
        state_value="북부 설원",
    )
    assert body["entityId"] == entity["id"]
    assert body["sceneId"] == scene["id"]
    assert body["stateKey"] == "location"
    assert body["stateValue"] == "북부 설원"
    assert body["source"] == "author"
    assert "id" in body and "createdAt" in body


async def test_list_timeline_states_without_filter_returns_all(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene1 = await _create_scene_chain(app, owner, owner_work.id)
    scene2 = await _create_scene_chain(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)
    await _create_timeline_state(app, owner, owner_work.id, entity["id"], scene1["id"])
    await _create_timeline_state(app, owner, owner_work.id, entity["id"], scene2["id"])

    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}/timeline-states"
        )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# 교차 테넌트 격리
# ---------------------------------------------------------------------------


async def test_create_timeline_state_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene_chain(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}/timeline-states",
            json={"sceneId": scene["id"], "stateKey": "life_status", "stateValue": "dead"},
        )
    assert resp.status_code == 404


async def test_list_timeline_states_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    entity = await _create_entity(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/entities/{entity['id']}/timeline-states"
        )
    assert resp.status_code == 404
