"""budget 게이트 의존성 테스트 (TDD, plan.md M4-S2).

``require_budget_available``를 FastAPI 라우팅 없이 직접 호출해, 이번 주기 누적
사용량(S1 ``get_usage``)이 상한(``settings.budget_token_limit``)을 넘으면 HTTP 429 +
안내 메시지로 막는지 확인한다. 라우터 와이어링(LLM 호출 전에 실제로 걸리는지,
차단 시 LLM이 호출되지 않는지)은 assist/dynamic_update 라우터 테스트에서 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import HTTPException

from core.redis import get_redis_client
from domains.auth.models import User
from domains.budget.dependency import require_budget_available
from domains.budget.service import record_usage

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
async def _cleanup_redis() -> AsyncIterator[None]:
    yield
    redis = await get_redis_client()
    async for key in redis.scan_iter(match="budget:usage:*"):
        await redis.delete(key)


async def test_passes_when_usage_under_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "1000")
    user = User(id=uuid.uuid4(), email="under@budget.test")
    await record_usage(user.id, 10)

    await require_budget_available(user=user)  # 예외 없이 통과해야 함


async def test_raises_429_with_message_when_usage_at_or_over_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "100")
    user = User(id=uuid.uuid4(), email="over@budget.test")
    await record_usage(user.id, 100)

    with pytest.raises(HTTPException) as exc_info:
        await require_budget_available(user=user)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "이번 주기 사용량 한도 도달"
