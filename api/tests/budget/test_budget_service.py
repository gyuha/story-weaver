"""budget 도메인 사용량 누적 카운터 테스트 (TDD, plan.md M4-S1).

실 Redis에 대해 동작을 확인한다(``core/redis.py``가 이미 다른 도메인 테스트에서도
실 Redis를 쓰는 것과 동일한 관례). 사용자별 고유 ``uuid4()``로 키를 격리하고,
각 테스트 후 직접 정리한다.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest

from core.redis import get_redis_client
from domains.budget.service import get_usage, record_usage

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
async def _cleanup_redis() -> AsyncIterator[None]:
    # root conftest의 ``_close_redis_between_tests``가 테스트 후 싱글턴을 닫으므로
    # 여기서는 남은 키만 정리한다.
    yield
    redis = await get_redis_client()
    async for key in redis.scan_iter(match="budget:usage:*"):
        await redis.delete(key)


async def test_record_usage_increments_counter() -> None:
    user_id = uuid.uuid4()

    total_after_first = await record_usage(user_id, 100)
    total_after_second = await record_usage(user_id, 50)

    assert total_after_first == 100
    assert total_after_second == 150
    assert await get_usage(user_id) == 150


async def test_get_usage_is_zero_when_never_recorded() -> None:
    user_id = uuid.uuid4()

    assert await get_usage(user_id) == 0


async def test_usage_resets_after_period_ttl() -> None:
    user_id = uuid.uuid4()

    await record_usage(user_id, 100, period_seconds=1)
    assert await get_usage(user_id) == 100

    await asyncio.sleep(1.5)

    assert await get_usage(user_id) == 0


async def test_usage_is_scoped_per_user() -> None:
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    await record_usage(user_a, 100)
    await record_usage(user_b, 20)

    assert await get_usage(user_a) == 100
    assert await get_usage(user_b) == 20
