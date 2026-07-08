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
    PRECHECK_DECLINE_MESSAGE,
    RETRY_DECLINE_MESSAGE,
    SOFTENED_NOTICE,
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


async def _create_scene(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, Any]:
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
            json={"orderIndex": 0, "body": "본문"},
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
# S1 — 선제 가드 (5개 엔드포인트 모두, LLM 호출 자체를 생략)
# ---------------------------------------------------------------------------


async def test_continue_explicit_input_never_reaches_llm(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    scene = await _create_scene(app, owner, owner_work.id)
    fake = _FlakyLLMClient([["절대 안 나와야 할 텍스트"]])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/assist/continue",
            json={"cursorText": "그는 그녀의 성기를 만졌다."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 0
    assert _sse_data_lines(resp.text) == [PRECHECK_DECLINE_MESSAGE, "[DONE]"]


@pytest.mark.parametrize(
    ("endpoint", "override_target", "payload_factory"),
    [
        (
            "infill",
            _infill_llm_client,
            lambda char_id: {"beforeText": "성기 삽입", "afterText": ""},
        ),
        (
            "dialogue",
            _dialogue_llm_client,
            lambda char_id: {"intent": "강간 장면을 묘사한다.", "targetEntityId": char_id},
        ),
        (
            "style",
            _style_llm_client,
            lambda char_id: {"text": "성기를 삽입했다.", "targetStyle": "하드보일드"},
        ),
        ("correct", _correct_llm_client, lambda char_id: {"text": "그는 성기를 삽입했다."}),
    ],
)
async def test_explicit_input_never_reaches_llm_for_other_assist_endpoints(
    app: FastAPI,
    owner: User,
    owner_work: Work,
    endpoint: str,
    override_target: Any,
    payload_factory: Any,
) -> None:
    scene = await _create_scene(app, owner, owner_work.id)
    character = await _create_character(app, owner, owner_work.id)
    fake = _FlakyLLMClient([["절대 안 나와야 할 텍스트"]])
    app.dependency_overrides[override_target] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/assist/{endpoint}",
            json=payload_factory(character["id"]),
        )

    assert resp.status_code == 200
    assert fake.call_count == 0
    assert _sse_data_lines(resp.text) == [PRECHECK_DECLINE_MESSAGE, "[DONE]"]


# ---------------------------------------------------------------------------
# S2 — 완화 재시도 (continue) — 거절/빈 응답 → 완화 프롬프트로 1회 재시도
# ---------------------------------------------------------------------------


async def test_continue_retries_once_with_softened_prompt_and_returns_notice(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    scene = await _create_scene(app, owner, owner_work.id)
    fake = _FlakyLLMClient([RuntimeError("raw provider secret detail"), ["완화된 결과 문장."]])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/assist/continue",
            json={"cursorText": "평범한 문장."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 2
    data_lines = _sse_data_lines(resp.text)
    assert "완화된 결과 문장." in data_lines
    assert SOFTENED_NOTICE in data_lines
    assert data_lines[-1] == "[DONE]"
    assert "raw provider secret detail" not in resp.text


async def test_continue_declines_politely_with_no_raw_error_when_retry_also_fails(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    scene = await _create_scene(app, owner, owner_work.id)
    fake = _FlakyLLMClient(
        [RuntimeError("raw provider secret A"), RuntimeError("raw provider secret B")]
    )
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/scenes/{scene['id']}/assist/continue",
            json={"cursorText": "평범한 문장."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 2
    assert _sse_data_lines(resp.text) == [RETRY_DECLINE_MESSAGE, "[DONE]"]
    assert "raw provider secret" not in resp.text
