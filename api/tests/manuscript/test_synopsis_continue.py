"""기획의도 AI 이어쓰기 HTTP 라우터 테스트 (TDD, task #53).

``POST /works/{work_id}/synopsis/continue`` — assist_router.py의 이어쓰기와 동일한
게이트 구성(precheck→budget→rate→완화 재시도)이지만, 씬이 없는 작품 단위 요청이라
메모리 검색은 하지 않는다(장르·서브장르·키워드·문체 + 클라이언트가 보낸 현재
기획의도 텍스트만으로 프롬프트를 조립).
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
from domains.manuscript.router import router as manuscript_router
from domains.manuscript.router.manuscript_router import _synopsis_continue_llm_client
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@synopsis-continue.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@synopsis-continue.test")
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
            user_id=owner.id,
            title="회귀한 무사",
            short_label="회",
            genre="무협",
            sub_genre="회귀",
            keywords=["복수", "성장"],
            style="간결체",
        )
        session.add(work)
        await session.commit()
        return work


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(manuscript_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeLLMClient:
    """``AbstractLLMPort.stream``만 흉내내는 fake — 조립된 메시지를 캡처."""

    def __init__(self, chunks: list[str]) -> None:
        self._chunks = chunks
        self.received_messages: list[Any] = []
        self.call_count = 0

    async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
        self.call_count += 1
        self.received_messages = messages
        for chunk in self._chunks:
            yield chunk


def _sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


# ---------------------------------------------------------------------------
# 프롬프트 조립 — 장르·서브장르·키워드·문체 + 현재 기획의도 텍스트
# ---------------------------------------------------------------------------


async def test_continue_streams_fake_chunks_and_prompt_includes_work_context(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    fake = _FakeLLMClient(["이어지는 문장 하나.", " 이어지는 문장 둘."])
    app.dependency_overrides[_synopsis_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/synopsis/continue",
            json={"text": "이 작품은 회귀한 무사가"},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == [
        "이어지는 문장 하나.",
        " 이어지는 문장 둘.",
        "[DONE]",
    ]

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "무협" in system_text
    assert "회귀" in system_text
    assert "복수" in system_text and "성장" in system_text
    assert "간결체" in system_text
    assert human_text == "이 작품은 회귀한 무사가"


# ---------------------------------------------------------------------------
# 교차 테넌트 404
# ---------------------------------------------------------------------------


async def test_continue_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    _, intruder = two_users
    fake = _FakeLLMClient(["응답"])
    app.dependency_overrides[_synopsis_continue_llm_client] = lambda: fake

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/synopsis/continue",
            json={"text": "아무 텍스트"},
        )

    assert resp.status_code == 404
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 빈 텍스트 거부
# ---------------------------------------------------------------------------


async def test_continue_blank_text_returns_422(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    fake = _FakeLLMClient(["응답"])
    app.dependency_overrides[_synopsis_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/synopsis/continue",
            json={"text": "   "},
        )

    assert resp.status_code == 422
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 예산 게이트
# ---------------------------------------------------------------------------


async def test_continue_blocked_when_usage_exceeds_budget_limit(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    owner, _ = two_users
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "50")
    await record_usage(owner.id, 100)
    fake = _FakeLLMClient(["응답"])
    app.dependency_overrides[_synopsis_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/synopsis/continue",
            json={"text": "이 작품은"},
        )

    assert resp.status_code == 429
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 수위 검열 선제 차단
# ---------------------------------------------------------------------------


async def test_continue_precheck_declines_explicit_content_without_calling_llm(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    fake = _FakeLLMClient(["응답"])
    app.dependency_overrides[_synopsis_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/synopsis/continue",
            json={"text": "그는 그녀의 성기를 만졌다."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 0
