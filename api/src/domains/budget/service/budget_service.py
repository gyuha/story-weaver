"""사용자별 누적 토큰 사용량 카운터 (plan.md M4-S1).

Redis 문자열 키에 ``INCRBY``로 토큰 수를 누적하고, 키가 이번 호출로 처음
생성됐을 때만 ``EXPIRE``를 걸어 고정 길이 주기로 자동 리셋한다(``core/redis.py``
docstring이 명시하는 "Rate limiting" 용도와 동일한 INCR+EXPIRE 패턴) — 별도
배치/크론이나 새 DB 테이블 없이 "주기 리셋"을 구현하는 가장 단순한 방법.

실제 요금제별 정확한 한도·주기는 미결정(PRD 4.1) — 이 모듈은 카운팅 구조만
제공하고, 상한 검사(budget 게이트)는 이후 작업(S2)의 몫이다.
"""

from __future__ import annotations

import uuid

from core.redis import get_redis_client

#: eco: 결제 주기 개념이 아직 없어 고정 30일 주기 하나로 시작한다(합리적 기본값).
#: 요금제가 정해지면 설정값으로 옮긴다.
DEFAULT_PERIOD_SECONDS = 30 * 24 * 60 * 60


def _usage_key(user_id: uuid.UUID) -> str:
    return f"budget:usage:{user_id}"


async def record_usage(
    user_id: uuid.UUID,
    tokens: int,
    *,
    period_seconds: int = DEFAULT_PERIOD_SECONDS,
) -> int:
    """사용자의 현재 주기 누적 토큰 수를 ``tokens``만큼 늘리고 새 합계를 반환.

    새 합계가 ``tokens``와 같다는 것은 이 호출이 (만료돼 사라졌거나 한 번도
    없던) 키를 새로 만들었다는 뜻이므로, 그때만 TTL을 걸어 이후 같은 주기 내
    호출이 만료 시각을 되돌리지 않게 한다.
    """
    redis = await get_redis_client()
    key = _usage_key(user_id)
    total = await redis.incrby(key, tokens)
    if total == tokens:
        await redis.expire(key, period_seconds)
    return int(total)


async def get_usage(user_id: uuid.UUID) -> int:
    """사용자의 현재 주기 누적 토큰 수(주기가 리셋됐거나 기록이 없으면 0)."""
    redis = await get_redis_client()
    value = await redis.get(_usage_key(user_id))
    return int(value) if value is not None else 0


def estimate_tokens(text: str) -> int:
    """텍스트 길이 기반 근사 토큰 수.

    eco: ``AbstractLLMPort.stream()``은 평문 ``str`` 청크만 내보내 사용량
    메타데이터가 없고(``LLMClient.astream``이 ``chunk.content``만 남기고
    버림), ``invoke()``의 ``AIMessage.usage_metadata``도 프로바이더마다
    보장되지 않는다 — 두 호출 경로 모두 "4자 ≈ 1토큰" 근사치로 통일해 쓴다.
    """
    return len(text) // 4
