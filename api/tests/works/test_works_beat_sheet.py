"""비트 시트 생성 API 테스트 (TDD, plan.md v2-A S3).

``POST /works/{work_id}/beat-sheet`` — dynamic_update의 extract-updates 테스트와 동일한
실 DB e2e 패턴(비-스트리밍 JSON 응답, LLM 호출만 FAKE로 override). 장르/키워드/문체
기반 고품질 티어(``Tier.high_quality``)로 생성한다 — 게이트 구성(precheck→budget→rate→
완화 재시도)은 assist_router.py/dynamic_update_router.py와 동일 순서.

FAKE 클라이언트 1건(티어+프롬프트 확인) + budget 게이트 2건(재사용 패턴) + 실 LLM 1건
(mock 없음).
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
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.works.router.works_router import _beat_sheet_llm_client


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def owner() -> AsyncIterator[User]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"owner-{uuid.uuid4().hex}@beatsheet.test")
        session.add(user)
        await session.commit()
        yield user
        await session.delete(user)
        await session.commit()


@pytest.fixture
async def owner_work(owner: User) -> Work:
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id,
            title="회귀한 무사",
            short_label="회",
            genre="무협",
            keywords=["회귀", "복수"],
            style="간결체",
        )
        session.add(work)
        await session.commit()
        return work


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(works_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeLLMClient:
    """``AbstractLLMPort.invoke``만 흉내내는 fake — 조립된 메시지를 캡처."""

    def __init__(self, content: str) -> None:
        self._content = content
        self.received_messages: list[Any] = []
        self.call_count = 0

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        self.call_count += 1
        self.received_messages = messages
        return _FakeResponse(self._content)


# ---------------------------------------------------------------------------
# FAKE LLM — 고품질 티어 클라이언트 사용 + 프롬프트에 장르/문체 포함
# ---------------------------------------------------------------------------


async def test_beat_sheet_uses_high_quality_tier_client_and_prompt_includes_genre_and_style(
    app: FastAPI, owner_work: Work, owner: User
) -> None:
    fake = _FakeLLMClient("1화: 발단 — 그는 눈을 떴다.\n2화: 전개 — 복수를 다짐한다.")
    app.dependency_overrides[_beat_sheet_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(f"/api/v1/works/{owner_work.id}/beat-sheet")

    assert resp.status_code == 200
    assert fake.call_count == 1
    assert resp.json()["beats"] == [
        "1화: 발단 — 그는 눈을 떴다.",
        "2화: 전개 — 복수를 다짐한다.",
    ]
    prompt_text = " ".join(str(m.content) for m in fake.received_messages)
    assert "무협" in prompt_text
    assert "간결체" in prompt_text


# ---------------------------------------------------------------------------
# Budget 게이트 (plan.md M4-S2와 동일 관례) — LLM 호출 전 사용자 누적 사용량 상한 검사
# ---------------------------------------------------------------------------


async def test_beat_sheet_proceeds_when_usage_under_budget_limit(
    app: FastAPI, owner_work: Work, owner: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "1000")
    fake = _FakeLLMClient("1화: 발단 — 그는 눈을 떴다.")
    app.dependency_overrides[_beat_sheet_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(f"/api/v1/works/{owner_work.id}/beat-sheet")

    assert resp.status_code == 200
    assert fake.call_count == 1


async def test_beat_sheet_blocked_when_usage_exceeds_budget_limit(
    app: FastAPI, owner_work: Work, owner: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "50")
    await record_usage(owner.id, 100)
    fake = _FakeLLMClient("1화: 발단 — 그는 눈을 떴다.")
    app.dependency_overrides[_beat_sheet_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(f"/api/v1/works/{owner_work.id}/beat-sheet")

    assert resp.status_code == 429
    assert resp.json()["detail"] == "이번 주기 사용량 한도 도달"
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 실 LLM 통합 테스트 (mock 없음) — 비어있지 않은 구조화 응답
# ---------------------------------------------------------------------------


async def test_beat_sheet_real_llm_returns_nonempty_beats(
    app: FastAPI, owner_work: Work, owner: User
) -> None:
    """LLM 클라이언트를 override하지 않는다 — 실 z.ai(GLM-4.6) 호출.

    비트 개수·문구는 어설션하지 않는다(비결정적, LLM 응답) — 비어있지 않은 비트가
    적어도 하나인지만 확인한다.
    """
    async with _client_as(app, owner, timeout=30.0) as client:
        resp = await client.post(f"/api/v1/works/{owner_work.id}/beat-sheet")

    assert resp.status_code == 200
    beats = resp.json()["beats"]
    assert len(beats) >= 1
    assert all(beat.strip() for beat in beats)
