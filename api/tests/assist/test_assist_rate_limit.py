"""집필 보조 엔드포인트 rate 게이트 테스트 (TDD, plan.md M4-S3).

``slowapi.Limiter``를 ``/assist/continue``에 적용해 사용자당 분당 상한
(``core.rate_limit.LLM_RATE_LIMIT``)을 넘으면 429를 반환하는지 확인한다. 상한 이내
요청은 전부 성공해야 하고, 서로 다른 화(다른 URL)를 호출해도 같은 사용자면 같은
버킷을 공유해야 한다(``key_style="endpoint"`` — URL별이 아니라 행동 종류별 한도).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from core.rate_limit import LLM_RATE_LIMIT
from domains.assist.router import router as assist_router
from domains.assist.router.assist_router import _continue_llm_client
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.router import router as manuscript_router
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.worldbible.router import router as worldbible_router

#: "N/minute" 문자열에서 N만 뽑아낸다 — 한도 값이 바뀌어도 테스트가 그대로 맞는다.
_LIMIT_COUNT = int(LLM_RATE_LIMIT.split("/")[0])


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def owner() -> AsyncIterator[User]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"owner-{uuid.uuid4().hex}@assist-rate.test")
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


class _FakeLLMClient:
    async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
        yield "x"


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


async def test_requests_up_to_the_limit_all_succeed(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id)
    app.dependency_overrides[_continue_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
                json={"cursorText": "그는 문을 열었다."},
            )
            assert resp.status_code == 200


async def test_exceeding_the_limit_returns_429(app: FastAPI, owner: User, owner_work: Work) -> None:
    """429 응답 자체의 상세 포맷(``Retry-After`` 헤더, 문구 wrap)은
    ``tests/test_rate_limit.py``에서 main.py와 동일한 앱 배선으로 확인한다 — 여기서는
    라우터에 데코레이터가 실제로 걸려 상한을 넘으면 차단되는지만 본다.
    """
    chapter = await _create_chapter(app, owner, owner_work.id)
    app.dependency_overrides[_continue_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
                json={"cursorText": "그는 문을 열었다."},
            )
            assert resp.status_code == 200

        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 문을 열었다."},
        )

    assert resp.status_code == 429


async def test_limit_is_shared_across_different_chapters_for_same_user(
    app: FastAPI, owner: User, owner_work: Work
) -> None:
    """화(URL)가 달라도 같은 사용자·같은 작업이면 한 버킷을 공유한다."""
    app.dependency_overrides[_continue_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            chapter = await _create_chapter(app, owner, owner_work.id)
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
                json={"cursorText": "그는 문을 열었다."},
            )
            assert resp.status_code == 200

        chapter = await _create_chapter(app, owner, owner_work.id)
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 문을 열었다."},
        )

    assert resp.status_code == 429


async def test_rate_limit_is_scoped_per_user(app: FastAPI, owner: User, owner_work: Work) -> None:
    """한 사용자가 한도를 다 써도 다른 사용자는 영향받지 않는다."""
    chapter = await _create_chapter(app, owner, owner_work.id)
    app.dependency_overrides[_continue_llm_client] = lambda: _FakeLLMClient()

    async with _client_as(app, owner) as client:
        for _ in range(_LIMIT_COUNT):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
                json={"cursorText": "그는 문을 열었다."},
            )
            assert resp.status_code == 200

    async with AsyncSessionFactory() as session:
        other_user = User(email=f"other-{uuid.uuid4().hex}@assist-rate.test")
        session.add(other_user)
        await session.commit()

    async with _client_as(app, other_user) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 문을 열었다."},
        )
    assert resp.status_code == 404  # 교차 테넌트(ADR-0005) — 429가 아니라는 것만 확인
