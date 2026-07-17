"""동적 업데이트 추출 API 테스트 (TDD, plan.md M3-S1).

``POST /works/{work_id}/chapters/{chapter_id}/extract-updates`` — assist_router 테스트의
실 DB e2e 패턴을 그대로 따르되, LLM 호출만 FAKE 클라이언트로 override한다
(``app.dependency_overrides``로 ``_extraction_llm_client`` 교체).

FAKE 클라이언트 2건(정상 JSON 파싱, 잘못된 JSON → 빈 결과) + 실 LLM 1건(mock 없음,
plan.md S1이 명시한 유일한 실 LLM 통합 테스트).
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
from domains.budget.service import record_usage
from domains.dynamic_update.router import router as dynamic_update_router
from domains.dynamic_update.router.dynamic_update_router import _extraction_llm_client
from domains.manuscript.router import router as manuscript_router
from domains.timeline.router import links_router as timeline_links_router
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
    """``AbstractLLMPort.invoke``만 흉내내는 fake — 캔드 텍스트를 그대로 반환."""

    def __init__(self, content: str) -> None:
        self._content = content
        self.call_count = 0

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        self.call_count += 1
        return _FakeResponse(self._content)


async def _create_chapter(
    app: FastAPI, owner: User, work_id: uuid.UUID, body: str
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": body},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_character(
    app: FastAPI, owner: User, work_id: uuid.UUID, name: str
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": name, "summary": "", "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


async def _link_entity(
    app: FastAPI, owner: User, work_id: uuid.UUID, chapter_id: str, entity_id: str
) -> None:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/chapters/{chapter_id}/links", json={"entityId": entity_id}
        )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# FAKE LLM — 정상 JSON → 3개 카테고리로 파싱
# ---------------------------------------------------------------------------


async def test_extract_updates_parses_fake_llm_json_into_three_categories(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    character = await _create_character(app, owner, owner_work.id, "한지원")
    chapter = await _create_chapter(app, owner, owner_work.id, body="한지원은 그 자리에서 죽었다.")
    await _link_entity(app, owner, owner_work.id, chapter["id"], character["id"])

    canned = (
        '{"candidateEntities": [{"name": "복면인", "summary": "정체불명의 자객"}], '
        f'"attributeChanges": [{{"entityId": "{character["id"]}", "attribute": "appearance", '
        '"newValue": "피투성이"}], '
        f'"timelineChanges": [{{"entityId": "{character["id"]}", "stateKey": "life_status", '
        '"stateValue": "dead"}]}'
    )
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient(canned)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["candidateEntities"] == [{"name": "복면인", "summary": "정체불명의 자객"}]
    assert body["attributeChanges"] == [
        {"entityId": character["id"], "attribute": "appearance", "newValue": "피투성이"}
    ]
    assert body["timelineChanges"] == [
        {"entityId": character["id"], "stateKey": "life_status", "stateValue": "dead"}
    ]


# ---------------------------------------------------------------------------
# FAKE LLM — 마크다운 코드펜스로 감싼 JSON도 파싱된다 (GLM-4.6 실측 응답 형태)
# ---------------------------------------------------------------------------


async def test_extract_updates_parses_json_wrapped_in_markdown_code_fence(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="본문")
    fenced = (
        '```json\n{"candidateEntities": [{"name": "복면인", "summary": "자객"}], '
        '"attributeChanges": [], "timelineChanges": []}\n```'
    )
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient(fenced)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    assert resp.json()["candidateEntities"] == [{"name": "복면인", "summary": "자객"}]


# ---------------------------------------------------------------------------
# FAKE LLM — 잘못된 JSON → 빈 결과 (크래시 없음)
# ---------------------------------------------------------------------------


async def test_extract_updates_malformed_json_returns_empty_result(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="아무 사건도 없다.")
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient("이건 JSON이 아님{{{")

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    assert resp.json() == {
        "candidateEntities": [],
        "attributeChanges": [],
        "timelineChanges": [],
    }


# ---------------------------------------------------------------------------
# Budget 게이트 (plan.md M4-S2) — LLM 호출 전 사용자 누적 사용량 상한 검사
# ---------------------------------------------------------------------------


async def test_extract_updates_proceeds_when_usage_under_budget_limit(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "1000")
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="본문")
    fake = _FakeLLMClient(
        '{"candidateEntities": [], "attributeChanges": [], "timelineChanges": []}'
    )
    app.dependency_overrides[_extraction_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    assert fake.call_count == 1


async def test_extract_updates_blocked_when_usage_exceeds_budget_limit(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "50")
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="본문")
    await record_usage(owner.id, 100)
    fake = _FakeLLMClient("{}")
    app.dependency_overrides[_extraction_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 429
    assert resp.json()["detail"] == "이번 주기 사용량 한도 도달"
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 교차 테넌트 격리 (ADR-0005)
# ---------------------------------------------------------------------------


async def test_extract_updates_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="본문")
    app.dependency_overrides[_extraction_llm_client] = lambda: _FakeLLMClient("{}")

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 실 LLM 통합 테스트 (plan.md S1 — mock 없음, 1건만)
# ---------------------------------------------------------------------------


async def test_extract_updates_real_llm_detects_new_fact(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """LLM 클라이언트를 override하지 않는다 — 실 z.ai(GLM-4.6) 호출.

    정확한 카테고리·내용은 어설션하지 않는다(비결정적, LLM 응답) — 3개 카테고리 중
    적어도 하나에 비어있지 않은 후보가 담겼는지만 확인한다.
    """
    owner, _ = two_users
    character = await _create_character(app, owner, owner_work.id, "한지원")
    chapter = await _create_chapter(app, owner, owner_work.id, body="한지원은 그 자리에서 죽었다.")
    await _link_entity(app, owner, owner_work.id, chapter["id"], character["id"])

    async with _client_as(app, owner, timeout=30.0) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    body = resp.json()
    total_candidates = (
        len(body["candidateEntities"])
        + len(body["attributeChanges"])
        + len(body["timelineChanges"])
    )
    assert total_candidates >= 1
