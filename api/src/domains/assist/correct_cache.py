"""교정(correct) 응답 캐싱 (plan.md M4-S2).

교정은 결정적인 작업이라 같은 입력을 짧은 시간 안에 반복하면 LLM을 다시 부를
필요가 없다. ``core/redis.py``의 "General cache" 용도를 ``budget/service``의
get/set 패턴처럼 그대로 쓴다 — 입력 텍스트 해시 + ``work_id``(테넌트 격리)를 키로
SSE 청크 목록을 짧은 TTL로 저장한다.

이어쓰기·인필링·지문/대사 변환·문체 변환은 매번 다른 출력이 목적이라(plan.md
비목표) 캐싱하지 않는다 — 이 모듈은 correct 전용이다.
"""

from __future__ import annotations

import hashlib
import json
import uuid

from core.redis import get_redis_client

#: eco: "같은 요청을 짧게 반복" 커버가 목적 — 정확한 값은 미결정, 5분 placeholder.
CACHE_TTL_SECONDS = 5 * 60


def _cache_key(work_id: uuid.UUID, text: str) -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()
    return f"assist:correct:{work_id}:{digest}"


async def get_cached(work_id: uuid.UUID, text: str) -> list[str] | None:
    """캐시된 SSE 청크 목록. 캐시 미스면 ``None``."""
    redis = await get_redis_client()
    cached = await redis.get(_cache_key(work_id, text))
    return json.loads(cached) if cached is not None else None


async def set_cached(work_id: uuid.UUID, text: str, chunks: list[str]) -> None:
    """SSE 청크 목록을 짧은 TTL로 캐싱."""
    redis = await get_redis_client()
    await redis.set(_cache_key(work_id, text), json.dumps(chunks), ex=CACHE_TTL_SECONDS)
