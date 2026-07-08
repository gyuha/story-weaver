"""assist.correct_cache 실 Redis 테스트 (TDD, plan.md M4-S2).

budget 도메인 테스트(``tests/budget/test_budget_service.py``)와 동일하게 실 Redis에
대해 동작을 확인한다. work_id별 격리(캐시 누수 방지)와 TTL 만료를 확인한다.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest

from core.redis import get_redis_client
from domains.assist.correct_cache import _cache_key, get_cached, set_cached

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
async def _cleanup_redis() -> AsyncIterator[None]:
    yield
    redis = await get_redis_client()
    async for key in redis.scan_iter(match="assist:correct:*"):
        await redis.delete(key)


async def test_get_cached_is_none_when_never_set() -> None:
    assert await get_cached(uuid.uuid4(), "아무 텍스트") is None


async def test_set_then_get_round_trips_chunks() -> None:
    work_id = uuid.uuid4()

    await set_cached(work_id, "그는 조용희 걸었다.", ["교정된 문장."])

    assert await get_cached(work_id, "그는 조용희 걸었다.") == ["교정된 문장."]


async def test_cache_is_scoped_per_work() -> None:
    text = "같은 텍스트"
    work_a = uuid.uuid4()
    work_b = uuid.uuid4()

    await set_cached(work_a, text, ["A 작품 교정 결과"])

    assert await get_cached(work_a, text) == ["A 작품 교정 결과"]
    assert await get_cached(work_b, text) is None  # 다른 작품으로는 누수되지 않음


async def test_different_text_is_a_cache_miss() -> None:
    work_id = uuid.uuid4()
    await set_cached(work_id, "원본 텍스트", ["결과"])

    assert await get_cached(work_id, "다른 텍스트") is None


async def test_cache_expires_after_ttl() -> None:
    work_id = uuid.uuid4()
    redis = await get_redis_client()
    await set_cached(work_id, "만료 테스트", ["결과"])
    # eco: 짧은 TTL 재현을 위해 저장 직후 만료 시각을 강제로 앞당긴다(1초).
    await redis.expire(_cache_key(work_id, "만료 테스트"), 1)

    await asyncio.sleep(1.5)

    assert await get_cached(work_id, "만료 테스트") is None
