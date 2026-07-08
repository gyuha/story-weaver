"""메모리 검색 API 실 DB e2e 테스트 (TDD, plan.md S4).

``GET /works/{work_id}/scenes/{scene_id}/memory`` — 1차(scene_entity_links로 링크된
엔티티 + 현재 시점까지의 타임라인 상태)와 보조(씬 본문 벡터 ANN, work_id 선필터,
1차에서 이미 나온 엔티티는 제외)를 병합해 반환하는지 확인한다. 실 로컬 임베딩
모델을 그대로 호출한다(mock 없음 — API 키/비용 없는 로컬 모델이라 가능, S2/S3와
동일 패턴).
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
from domains.memory.router import router as memory_router
from domains.timeline.router import links_router as timeline_links_router
from domains.works.models import Work
from domains.worldbible.router import router as worldbible_router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@memory.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@memory.test")
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
    app.include_router(timeline_links_router, prefix="/api/v1")
    app.include_router(memory_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_scene(
    app: FastAPI, owner: User, work_id: uuid.UUID, body: str = "본문"
) -> dict[str, Any]:
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
            json={"orderIndex": 0, "body": body},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_entity(
    app: FastAPI, owner: User, work_id: uuid.UUID, name: str, summary: str
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": name, "summary": summary, "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


async def _link(
    app: FastAPI, owner: User, work_id: uuid.UUID, scene_id: str, entity_id: str
) -> None:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/scenes/{scene_id}/links", json={"entityId": entity_id}
        )
    assert resp.status_code == 201


async def _get_memory(
    app: FastAPI, owner: User, work_id: uuid.UUID, scene_id: str
) -> list[dict[str, Any]]:
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work_id}/scenes/{scene_id}/memory")
    assert resp.status_code == 200
    result: list[dict[str, Any]] = resp.json()
    return result


# ---------------------------------------------------------------------------
# 1차: 링크된 엔티티
# ---------------------------------------------------------------------------


async def test_linked_entity_is_returned(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id, body="무사가 산길을 걸었다.")
    entity = await _create_entity(
        app, owner, owner_work.id, name="김무사", summary="주인공의 스승. 과묵하다."
    )
    await _link(app, owner, owner_work.id, scene["id"], entity["id"])

    items = await _get_memory(app, owner, owner_work.id, scene["id"])

    linked = [i for i in items if i["type"] == "entity" and i["entityId"] == entity["id"]]
    assert len(linked) == 1
    assert linked[0]["name"] == "김무사"
    assert linked[0]["priority"] == 1


# ---------------------------------------------------------------------------
# 보조: 벡터 유사도로 잡히는 미링크 엔티티
# ---------------------------------------------------------------------------


async def test_unlinked_similar_entity_returned_as_vector_match(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(
        app, owner, owner_work.id, body="무영곡 깊은 안개 속에서 검은 그림자가 나타났다."
    )
    unlinked = await _create_entity(
        app,
        owner,
        owner_work.id,
        name="무영곡",
        summary="짙은 안개가 깔린 협곡. 그림자들이 은둔하는 곳으로 알려져 있다.",
    )

    items = await _get_memory(app, owner, owner_work.id, scene["id"])

    vector_matches = [
        i for i in items if i["type"] == "vector_match" and i["sourceId"] == unlinked["id"]
    ]
    assert len(vector_matches) == 1
    assert vector_matches[0]["sourceType"] == "entity"
    assert vector_matches[0]["priority"] == 3
    # 링크된 적이 없으므로 1차(entity) 항목으로는 등장하지 않는다.
    assert not [i for i in items if i["type"] == "entity" and i["entityId"] == unlinked["id"]]


# ---------------------------------------------------------------------------
# 병합 중복제거: 1차·보조 양쪽에 걸리는 엔티티는 한 번만
# ---------------------------------------------------------------------------


async def test_linked_entity_also_similar_by_vector_appears_once(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    body = "폭풍 속에서 늙은 대장장이가 검을 벼렸다."
    scene = await _create_scene(app, owner, owner_work.id, body=body)
    # summary를 씬 본문과 거의 동일하게 둬 벡터 검색에서도 최상위로 잡히도록 한다.
    entity = await _create_entity(app, owner, owner_work.id, name="대장장이", summary=body)
    await _link(app, owner, owner_work.id, scene["id"], entity["id"])

    items = await _get_memory(app, owner, owner_work.id, scene["id"])

    matches_for_entity = [
        i
        for i in items
        if (i["type"] == "entity" and i["entityId"] == entity["id"])
        or (i["type"] == "vector_match" and i["sourceId"] == entity["id"])
    ]
    assert len(matches_for_entity) == 1
    assert matches_for_entity[0]["type"] == "entity"


# ---------------------------------------------------------------------------
# 교차 테넌트 격리
# ---------------------------------------------------------------------------


async def test_memory_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/memory")
    assert resp.status_code == 404
