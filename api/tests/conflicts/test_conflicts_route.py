"""설정 충돌 HTTP 라우트 — 실 DB + 실 라우터 경로 (S2, data-model.md 8장).

timeline/worldbible/manuscript 도메인의 실 DB e2e 패턴(서비스 fake override 없이
`get_current_user`만 override)을 따른다. 핵심 시나리오는 "3화 사망 → 10화 등장"
(global_seq 역행 모순) 탐지 — dead 이후 dead로 유지되는 것은 모순이 아니고, 예약되지
않은 state_key는 애초에 검사 대상이 아니다. 그 외 교차 테넌트 404를 확인한다.
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
from domains.conflicts.router import router as conflicts_router
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
        owner = User(email=f"owner-{uuid.uuid4().hex}@conflicts.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@conflicts.test")
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
    app.include_router(conflicts_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_chapter(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    """부→챕터를 만들어 반환(global_seq는 작품 내 자동 증가)."""
    async with _client_as(app, owner) as client:
        episode = await client.post(
            f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
        )
        assert episode.status_code == 201
        chapter = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode.json()['id']}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": "본문"},
        )
        assert chapter.status_code == 201
        return chapter.json()


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
    chapter_id: str,
    state_key: str,
    state_value: str,
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities/{entity_id}/timeline-states",
            json={"chapterId": chapter_id, "stateKey": state_key, "stateValue": state_value},
        )
    assert resp.status_code == 201
    return resp.json()


async def _get_conflicts(app: FastAPI, user: User, work_id: uuid.UUID) -> Any:
    async with _client_as(app, user) as client:
        return await client.get(f"/api/v1/works/{work_id}/conflicts")


# ---------------------------------------------------------------------------
# 핵심 시나리오 — "3화 사망 → 10화 등장" 시점 역행 모순 탐지
# ---------------------------------------------------------------------------


async def test_dead_then_appear_alive_later_is_flagged_as_conflict(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter_dead = await _create_chapter(app, owner, owner_work.id)  # "3화" 격 (챕터)
    chapter_appear = await _create_chapter(app, owner, owner_work.id)  # "10화" 격 (챕터)
    assert chapter_dead["globalSeq"] < chapter_appear["globalSeq"]
    entity = await _create_entity(app, owner, owner_work.id)

    dead_state = await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter_dead["id"], "life_status", "dead"
    )
    alive_state = await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter_appear["id"], "life_status", "alive"
    )

    resp = await _get_conflicts(app, owner, owner_work.id)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    conflict = body[0]
    assert conflict["entityId"] == entity["id"]
    assert conflict["entityName"] == entity["name"]
    assert conflict["stateKey"] == "life_status"
    assert conflict["earlier"]["id"] == dead_state["id"]
    assert conflict["earlier"]["stateValue"] == "dead"
    assert conflict["earlier"]["globalSeq"] == chapter_dead["globalSeq"]
    assert conflict["later"]["id"] == alive_state["id"]
    assert conflict["later"]["stateValue"] == "alive"
    assert conflict["later"]["globalSeq"] == chapter_appear["globalSeq"]


async def test_dead_then_still_dead_is_not_flagged(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter1 = await _create_chapter(app, owner, owner_work.id)
    chapter2 = await _create_chapter(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter1["id"], "life_status", "dead"
    )
    await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter2["id"], "life_status", "dead"
    )

    resp = await _get_conflicts(app, owner, owner_work.id)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_non_reserved_state_key_is_never_checked(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter1 = await _create_chapter(app, owner, owner_work.id)
    chapter2 = await _create_chapter(app, owner, owner_work.id)
    entity = await _create_entity(app, owner, owner_work.id)

    await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter1["id"], "location", "북부 설원"
    )
    await _create_timeline_state(
        app, owner, owner_work.id, entity["id"], chapter2["id"], "location", "남부 항구"
    )

    resp = await _get_conflicts(app, owner, owner_work.id)
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# 교차 테넌트 격리
# ---------------------------------------------------------------------------


async def test_conflicts_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    _, intruder = two_users
    resp = await _get_conflicts(app, intruder, owner_work.id)
    assert resp.status_code == 404
