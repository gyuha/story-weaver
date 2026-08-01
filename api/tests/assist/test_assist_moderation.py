"""집필 보조 엔드포인트 모더레이션 와이어링 테스트 (TDD, plan.md M4-S1/S2).

test_assist_router.py의 실 DB e2e 패턴을 그대로 따른다. S1(선제 가드)은 5개
엔드포인트 모두에, S2(완화 재시도)는 최소 요구사항인 ``continue``에 건다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.assist.router import router as assist_router
from domains.assist.router.assist_router import (
    _continue_llm_client,
    _correct_llm_client,
    _dialogue_llm_client,
    _infill_llm_client,
    _style_llm_client,
)
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.router import router as manuscript_router
from domains.moderation.service import (
    PROVIDER_DECLINE_MESSAGE,
)
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.worldbible.router import router as worldbible_router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def owner() -> AsyncIterator[User]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"owner-{uuid.uuid4().hex}@assist-mod.test")
        session.add(user)
        await session.commit()
        yield user
        await session.delete(user)
        await session.commit()


@pytest.fixture
async def owner_work(owner: User) -> Work:
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
    app.include_router(assist_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=5.0)


def _sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


class _FlakyLLMClient:
    """호출마다 미리 정해둔 결과(정상 청크 목록 또는 예외)를 순서대로 재생."""

    def __init__(self, outcomes: list[list[str] | Exception]) -> None:
        self._outcomes = outcomes
        self.call_count = 0

    async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
        outcome = self._outcomes[self.call_count]
        self.call_count += 1
        if isinstance(outcome, Exception):
            raise outcome
        for chunk in outcome:
            yield chunk


async def _create_chapter(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": "본문"},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_character(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": "한지원", "summary": "", "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# 연령·수위 제한 제거(ADR `260730-070532`) — 어떤 입력이든 LLM에 도달해야 한다.
# 과거 S1 키워드 가드는 한국어 부분 문자열 매칭이라 "돌아보지 마십시오"(보지)·
# "자지 않았다"(자지)·"사정이 있다"(사정) 같은 평범한 원고를 차단했다.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cursor_text",
    [
        "[수사관: 지금부터 뒤를 돌아보지 마십시오.]",  # 보지 — 실제 사용자 원고
        "그날 밤 그는 잠을 자지 않았다.",  # 자지
        "집안 사정이 어려웠다.",  # 사정
        "그는 그녀의 성기를 만졌다.",  # 과거 차단 대상 — 이제 제공자 판단에 맡긴다
    ],
)
async def test_continue_reaches_llm_for_any_input(
    app: FastAPI, owner: User, owner_work: Work, cursor_text: str
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FlakyLLMClient([["이어진 문장."]])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": cursor_text},
        )

    assert resp.status_code == 200
    assert fake.call_count == 1
    assert _sse_data_lines(resp.text) == ["이어진 문장.", "[DONE]"]


@pytest.mark.parametrize(
    ("endpoint", "override_target", "payload_factory"),
    [
        (
            "infill",
            _infill_llm_client,
            lambda char_id: {"beforeText": "뒤를 돌아보지 마십시오.", "afterText": ""},
        ),
        (
            "dialogue",
            _dialogue_llm_client,
            lambda char_id: {"intent": "잠을 자지 않았다고 말한다.", "targetEntityId": char_id},
        ),
        (
            "style",
            _style_llm_client,
            lambda char_id: {"text": "집안 사정이 어려웠다.", "targetStyle": "하드보일드"},
        ),
        ("correct", _correct_llm_client, lambda char_id: {"text": "그는 보지 못했다."}),
    ],
)
async def test_other_assist_endpoints_reach_llm_for_any_input(
    app: FastAPI,
    owner: User,
    owner_work: Work,
    endpoint: str,
    override_target: Any,
    payload_factory: Any,
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id)
    character = await _create_character(app, owner, owner_work.id)
    fake = _FlakyLLMClient([["생성 결과."]])
    app.dependency_overrides[override_target] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/{endpoint}",
            json=payload_factory(character["id"]),
        )

    assert resp.status_code == 200
    assert fake.call_count == 1
    assert _sse_data_lines(resp.text) == ["생성 결과.", "[DONE]"]


# ---------------------------------------------------------------------------
# 제공자 거절 — 자동 완화 재시도 없이 정직하게 안내한다(ADR `260730-070532`).
# ---------------------------------------------------------------------------


async def test_continue_does_not_retry_and_declines_on_provider_refusal(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    """거절 시 완화 프롬프트로 재시도하지 않는다 — 작가가 쓴 수위를 시스템이 낮추지 않는다."""
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FlakyLLMClient([RuntimeError("raw provider secret detail")])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "평범한 문장."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 1  # 재시도 없음
    assert _sse_data_lines(resp.text) == [PROVIDER_DECLINE_MESSAGE, "[DONE]"]
    assert "raw provider secret detail" not in resp.text
    assert "수위" not in resp.text  # 잘못된 이유로 표시하지 않는다
