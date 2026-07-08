"""매칭·제안 저장(S2) + 승인/거절 반영(S3) 테스트 (TDD, plan.md M3-S2/S3).

``POST /works/{work_id}/scenes/{scene_id}/extract-updates``가 추출 후 자동으로
기존 엔티티와 매칭해 노이즈(동일 값)를 걸러내고 제안 레코드를 저장한다(S2).
``GET .../update-suggestions``로 조회하고, ``POST .../update-suggestions/{id}/approve``
로 승인(엔티티/타임라인 상태 반영)하거나 ``.../reject``로 거절(데이터 변경 없음)한다(S3).

test_extraction_router.py와 동일한 실 DB e2e 패턴 — LLM 호출만 FAKE 클라이언트로
override한다.
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
from domains.dynamic_update.router import router as dynamic_update_router
from domains.dynamic_update.router.dynamic_update_router import _extraction_llm_client
from domains.manuscript.router import router as manuscript_router
from domains.timeline.router import links_router as timeline_links_router
from domains.timeline.router import router as timeline_states_router
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.worldbible.router import router as worldbible_router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@dynupdate.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@dynupdate.test")
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
    app.include_router(works_router, prefix="/api/v1")
    app.include_router(manuscript_router, prefix="/api/v1")
    app.include_router(worldbible_router, prefix="/api/v1")
    app.include_router(timeline_links_router, prefix="/api/v1")
    app.include_router(timeline_states_router, prefix="/api/v1")
    app.include_router(dynamic_update_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeLLMClient:
    def __init__(self, content: str) -> None:
        self._content = content

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        return _FakeResponse(self._content)


async def _create_scene(app: FastAPI, owner: User, work_id: uuid.UUID, body: str) -> dict[str, Any]:
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


async def _create_character(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    name: str,
    attributes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={
                "entityType": "character",
                "name": name,
                "summary": "",
                "attributes": attributes or {},
            },
        )
    assert resp.status_code == 201
    return resp.json()


async def _link_entity(
    app: FastAPI, owner: User, work_id: uuid.UUID, scene_id: str, entity_id: str
) -> None:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/scenes/{scene_id}/links", json={"entityId": entity_id}
        )
    assert resp.status_code == 201


async def _create_timeline_state(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    entity_id: str,
    scene_id: str,
    state_key: str,
    state_value: str,
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities/{entity_id}/timeline-states",
            json={"sceneId": scene_id, "stateKey": state_key, "stateValue": state_value},
        )
    assert resp.status_code == 201
    return resp.json()


async def _extract_updates(
    app: FastAPI, user: User, work_id: uuid.UUID, scene_id: str, canned: str
) -> dict[str, Any]:
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient(canned)
    async with _client_as(app, user) as client:
        resp = await client.post(f"/api/v1/works/{work_id}/scenes/{scene_id}/extract-updates")
    assert resp.status_code == 200
    return resp.json()


async def _list_suggestions(
    app: FastAPI, user: User, work_id: uuid.UUID, scene_id: str
) -> list[dict[str, Any]]:
    async with _client_as(app, user) as client:
        resp = await client.get(f"/api/v1/works/{work_id}/scenes/{scene_id}/update-suggestions")
    assert resp.status_code == 200
    return resp.json()


def _empty_extraction(
    candidate_entities: list[dict[str, str]] | None = None,
    attribute_changes: list[dict[str, str]] | None = None,
    timeline_changes: list[dict[str, str]] | None = None,
) -> str:
    import json

    return json.dumps(
        {
            "candidateEntities": candidate_entities or [],
            "attributeChanges": attribute_changes or [],
            "timelineChanges": timeline_changes or [],
        }
    )


# ---------------------------------------------------------------------------
# S2 — 매칭·노이즈 억제·제안 저장
# ---------------------------------------------------------------------------


async def test_extract_updates_persists_genuinely_new_candidate_entity_as_suggestion(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id, body="복면인이 나타났다.")
    canned = _empty_extraction(candidate_entities=[{"name": "복면인", "summary": "자객"}])

    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene["id"])

    assert len(suggestions) == 1
    assert suggestions[0]["kind"] == "new_entity"
    assert suggestions[0]["status"] == "pending"
    assert suggestions[0]["payload"] == {"name": "복면인", "summary": "자객"}


async def test_extract_updates_drops_candidate_entity_matching_existing_entity_name(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    await _create_character(app, owner, owner_work.id, "한지원")
    scene = await _create_scene(app, owner, owner_work.id, body="한지원이 나타났다.")
    # 대소문자만 다른 이름도 매칭되어야 한다.
    canned = _empty_extraction(candidate_entities=[{"name": "한지원", "summary": "주인공"}])

    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene["id"])

    assert suggestions == []


async def test_extract_updates_persists_attribute_change_when_value_differs(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(
        app, owner, owner_work.id, "한지원", attributes={"appearance": "차분한 인상"}
    )
    scene = await _create_scene(app, owner, owner_work.id, body="한지원의 얼굴이 피투성이였다.")
    canned = _empty_extraction(
        attribute_changes=[
            {"entityId": character["id"], "attribute": "appearance", "newValue": "피투성이"}
        ]
    )

    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene["id"])

    assert len(suggestions) == 1
    assert suggestions[0]["kind"] == "attribute_change"
    assert suggestions[0]["payload"] == {
        "entityId": character["id"],
        "attribute": "appearance",
        "newValue": "피투성이",
    }


async def test_extract_updates_drops_attribute_change_matching_current_value(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(
        app, owner, owner_work.id, "한지원", attributes={"appearance": "차분한 인상"}
    )
    scene = await _create_scene(app, owner, owner_work.id, body="한지원은 여전히 차분했다.")
    canned = _empty_extraction(
        attribute_changes=[
            {"entityId": character["id"], "attribute": "appearance", "newValue": "차분한 인상"}
        ]
    )

    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene["id"])

    assert suggestions == []


async def test_extract_updates_persists_timeline_change_when_value_differs(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(app, owner, owner_work.id, "한지원")
    scene1 = await _create_scene(app, owner, owner_work.id, body="한지원은 살아있었다.")
    await _create_timeline_state(
        app, owner, owner_work.id, character["id"], scene1["id"], "life_status", "alive"
    )
    scene2 = await _create_scene(app, owner, owner_work.id, body="한지원은 그 자리에서 죽었다.")
    canned = _empty_extraction(
        timeline_changes=[
            {"entityId": character["id"], "stateKey": "life_status", "stateValue": "dead"}
        ]
    )

    await _extract_updates(app, owner, owner_work.id, scene2["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene2["id"])

    assert len(suggestions) == 1
    assert suggestions[0]["kind"] == "timeline_state"
    assert suggestions[0]["payload"] == {
        "entityId": character["id"],
        "stateKey": "life_status",
        "stateValue": "dead",
    }


async def test_extract_updates_drops_timeline_change_matching_latest_state(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(app, owner, owner_work.id, "한지원")
    scene1 = await _create_scene(app, owner, owner_work.id, body="한지원은 살아있었다.")
    await _create_timeline_state(
        app, owner, owner_work.id, character["id"], scene1["id"], "life_status", "alive"
    )
    scene2 = await _create_scene(app, owner, owner_work.id, body="한지원은 여전히 살아있다.")
    canned = _empty_extraction(
        timeline_changes=[
            {"entityId": character["id"], "stateKey": "life_status", "stateValue": "alive"}
        ]
    )

    await _extract_updates(app, owner, owner_work.id, scene2["id"], canned)
    suggestions = await _list_suggestions(app, owner, owner_work.id, scene2["id"])

    assert suggestions == []


# ---------------------------------------------------------------------------
# S3 — 승인/거절 반영
# ---------------------------------------------------------------------------


async def test_approve_new_entity_suggestion_creates_entity(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id, body="복면인이 나타났다.")
    canned = _empty_extraction(candidate_entities=[{"name": "복면인", "summary": "자객"}])
    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestion = (await _list_suggestions(app, owner, owner_work.id, scene["id"]))[0]

    async with _client_as(app, owner) as client:
        approve_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}"
            f"/update-suggestions/{suggestion['id']}/approve"
        )
        entities_resp = await client.get(f"/api/v1/works/{owner_work.id}/entities")

    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"
    entities = entities_resp.json()
    assert any(e["name"] == "복면인" and e["summary"] == "자객" for e in entities)


async def test_approve_attribute_change_suggestion_updates_entity_attributes(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(
        app, owner, owner_work.id, "한지원", attributes={"appearance": "차분한 인상"}
    )
    scene = await _create_scene(app, owner, owner_work.id, body="한지원의 얼굴이 피투성이였다.")
    canned = _empty_extraction(
        attribute_changes=[
            {"entityId": character["id"], "attribute": "appearance", "newValue": "피투성이"}
        ]
    )
    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestion = (await _list_suggestions(app, owner, owner_work.id, scene["id"]))[0]

    async with _client_as(app, owner) as client:
        approve_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}"
            f"/update-suggestions/{suggestion['id']}/approve"
        )
        entity_resp = await client.get(f"/api/v1/works/{owner_work.id}/entities/{character['id']}")

    assert approve_resp.status_code == 200
    assert entity_resp.json()["attributes"]["appearance"] == "피투성이"


async def test_approve_timeline_change_suggestion_creates_ai_suggested_state(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(app, owner, owner_work.id, "한지원")
    scene1 = await _create_scene(app, owner, owner_work.id, body="한지원은 살아있었다.")
    await _create_timeline_state(
        app, owner, owner_work.id, character["id"], scene1["id"], "life_status", "alive"
    )
    scene2 = await _create_scene(app, owner, owner_work.id, body="한지원은 그 자리에서 죽었다.")
    canned = _empty_extraction(
        timeline_changes=[
            {"entityId": character["id"], "stateKey": "life_status", "stateValue": "dead"}
        ]
    )
    await _extract_updates(app, owner, owner_work.id, scene2["id"], canned)
    suggestion = (await _list_suggestions(app, owner, owner_work.id, scene2["id"]))[0]

    async with _client_as(app, owner) as client:
        approve_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene2['id']}"
            f"/update-suggestions/{suggestion['id']}/approve"
        )
        states_resp = await client.get(
            f"/api/v1/works/{owner_work.id}/entities/{character['id']}/timeline-states"
        )

    assert approve_resp.status_code == 200
    states = states_resp.json()
    dead_states = [
        s for s in states if s["stateKey"] == "life_status" and s["stateValue"] == "dead"
    ]
    assert len(dead_states) == 1
    assert dead_states[0]["source"] == "ai_suggested"


async def test_reject_suggestion_marks_rejected_without_mutating_data(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    scene = await _create_scene(app, owner, owner_work.id, body="복면인이 나타났다.")
    canned = _empty_extraction(candidate_entities=[{"name": "복면인", "summary": "자객"}])
    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestion = (await _list_suggestions(app, owner, owner_work.id, scene["id"]))[0]

    async with _client_as(app, owner) as client:
        reject_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}"
            f"/update-suggestions/{suggestion['id']}/reject"
        )
        entities_resp = await client.get(f"/api/v1/works/{owner_work.id}/entities")

    assert reject_resp.status_code == 200
    assert reject_resp.json()["status"] == "rejected"
    assert entities_resp.json() == []


# ---------------------------------------------------------------------------
# 교차 테넌트 격리 (ADR-0005) — list/approve/reject 전부
# ---------------------------------------------------------------------------


async def test_suggestions_other_tenant_returns_404_on_all_endpoints(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    scene = await _create_scene(app, owner, owner_work.id, body="복면인이 나타났다.")
    canned = _empty_extraction(candidate_entities=[{"name": "복면인", "summary": "자객"}])
    await _extract_updates(app, owner, owner_work.id, scene["id"], canned)
    suggestion = (await _list_suggestions(app, owner, owner_work.id, scene["id"]))[0]

    async with _client_as(app, intruder) as client:
        list_resp = await client.get(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/update-suggestions"
        )
        approve_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}"
            f"/update-suggestions/{suggestion['id']}/approve"
        )
        reject_resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}"
            f"/update-suggestions/{suggestion['id']}/reject"
        )

    assert list_resp.status_code == 404
    assert approve_resp.status_code == 404
    assert reject_resp.status_code == 404
