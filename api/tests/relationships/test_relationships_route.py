"""캐릭터 관계도 HTTP 라우트 — 실 DB + 실 라우터 경로 (v2-C S1/S2).

conflicts/timeline/worldbible 도메인의 실 DB e2e 패턴(서비스 fake override 없이
``get_current_user``/LLM 클라이언트만 override)을 따른다.

S1(기본 그래프): 인물 카드 ``attributes.relations``가 그대로 엣지로 반영되는지,
대상이 사라진 관계는 생략되는지 확인한다. S2(시점별 요약): ``up_to_chapter_id``까지의
``relation_to_*`` 타임라인 상태가 엣지에 반영되고 FAKE LLM으로 요약이 생성되는지,
그 시점 이후의 상태는 반영되지 않는지, 사실이 없으면 LLM을 호출하지 않는지 확인한다.
마지막으로 실 LLM 1건(mock 없음)과 교차 테넌트 404를 확인한다.
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
from domains.relationships.router import router as relationships_router
from domains.relationships.router.relationships_router import _relationships_llm_client
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
        owner = User(email=f"owner-{uuid.uuid4().hex}@relationships.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@relationships.test")
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
    app.include_router(relationships_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeLLMClient:
    """``AbstractLLMPort.invoke``만 흉내내는 fake — 조립된 메시지를 캡처(works 테스트와 동일)."""

    def __init__(self, content: str) -> None:
        self._content = content
        self.received_messages: list[Any] = []
        self.call_count = 0

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        self.call_count += 1
        self.received_messages = messages
        return _FakeResponse(self._content)


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


async def _create_entity(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    name: str,
    attributes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": name, "attributes": attributes or {}},
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


async def _get_relationships(
    app: FastAPI, user: User, work_id: uuid.UUID, up_to_chapter_id: str | None = None
) -> Any:
    params = {"up_to_chapter_id": up_to_chapter_id} if up_to_chapter_id else {}
    async with _client_as(app, user) as client:
        return await client.get(f"/api/v1/works/{work_id}/relationships", params=params)


# ---------------------------------------------------------------------------
# S1 — 기본 관계 그래프
# ---------------------------------------------------------------------------


async def test_relationships_reflects_entity_attributes_relations(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    target = await _create_entity(app, owner, owner_work.id, "이서연")
    source = await _create_entity(
        app,
        owner,
        owner_work.id,
        "김무사",
        {"relations": [{"target_entity_id": target["id"], "type": "우호", "note": "동료"}]},
    )
    app.dependency_overrides[_relationships_llm_client] = lambda: _FakeLLMClient("(사용 안 됨)")

    resp = await _get_relationships(app, owner, owner_work.id)

    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] is None
    assert body["edges"] == [
        {
            "sourceEntityId": source["id"],
            "sourceName": "김무사",
            "targetEntityId": target["id"],
            "targetName": "이서연",
            "type": "우호",
            "note": "동료",
        }
    ]


async def test_relationships_omits_edge_with_dangling_target(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    dangling_id = str(uuid.uuid4())
    await _create_entity(
        app,
        owner,
        owner_work.id,
        "김무사",
        {"relations": [{"target_entity_id": dangling_id, "type": "우호"}]},
    )

    resp = await _get_relationships(app, owner, owner_work.id)

    assert resp.status_code == 200
    assert resp.json()["edges"] == []


# ---------------------------------------------------------------------------
# S2 — 시점별(up_to_chapter_id) 관계 요약
# ---------------------------------------------------------------------------


async def test_up_to_chapter_id_incorporates_relation_state_and_generates_summary(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    source = await _create_entity(app, owner, owner_work.id, "김무사")
    target = await _create_entity(app, owner, owner_work.id, "이서연")
    await _create_timeline_state(
        app,
        owner,
        owner_work.id,
        source["id"],
        chapter["id"],
        f"relation_to_{target['id']}",
        "라이벌",
    )
    fake = _FakeLLMClient("김무사와 이서연은 라이벌 관계다.")
    app.dependency_overrides[_relationships_llm_client] = lambda: fake

    resp = await _get_relationships(app, owner, owner_work.id, up_to_chapter_id=chapter["id"])

    assert resp.status_code == 200
    body = resp.json()
    assert body["edges"] == [
        {
            "sourceEntityId": source["id"],
            "sourceName": "김무사",
            "targetEntityId": target["id"],
            "targetName": "이서연",
            "type": "라이벌",
            "note": None,
        }
    ]
    assert body["summary"] == "김무사와 이서연은 라이벌 관계다."
    assert fake.call_count == 1


async def test_up_to_chapter_id_excludes_relation_state_after_that_point(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter1 = await _create_chapter(app, owner, owner_work.id)
    chapter2 = await _create_chapter(app, owner, owner_work.id)
    assert chapter1["globalSeq"] < chapter2["globalSeq"]
    source = await _create_entity(app, owner, owner_work.id, "김무사")
    target = await _create_entity(app, owner, owner_work.id, "이서연")
    await _create_timeline_state(
        app,
        owner,
        owner_work.id,
        source["id"],
        chapter2["id"],
        f"relation_to_{target['id']}",
        "라이벌",
    )
    fake = _FakeLLMClient("(사용 안 됨)")
    app.dependency_overrides[_relationships_llm_client] = lambda: fake

    resp = await _get_relationships(app, owner, owner_work.id, up_to_chapter_id=chapter1["id"])

    assert resp.status_code == 200
    body = resp.json()
    assert body["edges"] == []
    assert body["summary"] is None
    assert fake.call_count == 0  # 사실이 없으면 LLM 호출 자체를 생략(eco)


# ---------------------------------------------------------------------------
# 실 LLM 통합 테스트 (mock 없음) — 비어있지 않은 요약
# ---------------------------------------------------------------------------


async def test_relationships_real_llm_returns_nonempty_summary(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """LLM 클라이언트를 override하지 않는다 — 실 z.ai(GLM-4.6) 호출.

    문구는 어설션하지 않는다(비결정적, LLM 응답) — 비어있지 않은지만 확인한다.
    """
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    source = await _create_entity(app, owner, owner_work.id, "김무사")
    target = await _create_entity(app, owner, owner_work.id, "이서연")
    await _create_timeline_state(
        app,
        owner,
        owner_work.id,
        source["id"],
        chapter["id"],
        f"relation_to_{target['id']}",
        "라이벌",
    )

    resp = await _get_relationships(app, owner, owner_work.id, up_to_chapter_id=chapter["id"])

    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert summary is not None
    assert summary.strip()


# ---------------------------------------------------------------------------
# 교차 테넌트 격리
# ---------------------------------------------------------------------------


async def test_relationships_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    _, intruder = two_users
    resp = await _get_relationships(app, intruder, owner_work.id)
    assert resp.status_code == 404
