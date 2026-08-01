"""동적 업데이트 추출 모더레이션 와이어링 테스트 (TDD, plan.md M4-S1/S2).

test_extraction_router.py의 실 DB e2e 패턴을 그대로 따른다. S1(선제 가드)은 씬
본문에, S2(완화 재시도)는 LLM 호출 결과에 건다. 응답 스키마가 자유 텍스트를
담을 슬롯이 없어(``ExtractUpdatesResponse``), 완곡 안내는 budget 게이트와 동일한
관례로 ``HTTPException``의 ``detail``에 담는다.
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
from domains.moderation.service import PROVIDER_DECLINE_MESSAGE
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
        user = User(email=f"owner-{uuid.uuid4().hex}@dynupdate-mod.test")
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
    app.include_router(dynamic_update_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=5.0)


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FlakyLLMClient:
    """호출마다 미리 정해둔 결과(정상 텍스트 또는 예외)를 순서대로 재생."""

    def __init__(self, outcomes: list[str | Exception]) -> None:
        self._outcomes = outcomes
        self.call_count = 0

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        outcome = self._outcomes[self.call_count]
        self.call_count += 1
        if isinstance(outcome, Exception):
            raise outcome
        return _FakeResponse(outcome)


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


# ---------------------------------------------------------------------------
# 연령·수위 제한 제거(ADR `260730-070532`) — 어떤 본문이든 추출이 LLM에 도달한다.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        "[수사관: 지금부터 뒤를 돌아보지 마십시오.]",  # 보지 — 과거 오탐
        "그는 그녀의 성기를 만졌다.",  # 과거 차단 대상
    ],
)
async def test_extract_updates_reaches_llm_for_any_body(
    app: FastAPI, owner_work: Work, owner: User, body: str
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id, body=body)
    fake = _FlakyLLMClient(
        ['{"candidateEntities": [], "attributeChanges": [], "timelineChanges": []}']
    )
    app.dependency_overrides[_extraction_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 200
    assert fake.call_count == 1


# ---------------------------------------------------------------------------
# 제공자 거절 — 완화 재시도 없이 정직하게 안내한다(ADR `260730-070532`).
# ---------------------------------------------------------------------------


async def test_extract_updates_does_not_retry_and_declines_on_provider_refusal(
    app: FastAPI, owner_work: Work, owner: User
) -> None:
    chapter = await _create_chapter(app, owner, owner_work.id, body="아무 사건도 없다.")
    fake = _FlakyLLMClient([RuntimeError("raw provider secret detail")])
    app.dependency_overrides[_extraction_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/extract-updates"
        )

    assert resp.status_code == 400
    assert resp.json()["detail"] == PROVIDER_DECLINE_MESSAGE
    assert fake.call_count == 1  # 재시도 없음
    assert "raw provider secret" not in resp.text
    assert "수위" not in resp.text
