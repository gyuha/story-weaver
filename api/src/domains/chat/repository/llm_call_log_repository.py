"""LLM 호출 로그 fire-and-forget 저장 (ADR-0009).

`save_llm_call_log`은 요청 세션이 아닌 자체 세션(`AsyncSessionFactory`)으로
INSERT하고, 실패해도 예외를 삼켜 warning 로그만 남긴다 — 로그 저장 실패가
본 LLM 호출을 막아서는 안 된다는 원칙(ADR-0009 Consequences)을 지키기 위함.

보존 삭제는 스케줄러 없이 INSERT 경로에서 낮은 빈도(100회당 1회)로
`DELETE WHERE created_at < now() - 30일`을 실행하는 "기회적 삭제"로 구현한다
(budget_service.py의 인프라 없는 주기 리셋과 같은 결).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import delete

from core.database import AsyncSessionFactory
from domains.chat.models import LLMCallLog

logger = structlog.get_logger(__name__)

RETENTION_DAYS = 30

#: eco: 정확한 주기 삭제(크론/배치) 대신 INSERT 경로에서 100회당 1회만 만료 행을
#: 지운다 — 호출이 뜸한 기간엔 만료 행이 잠시 남을 수 있으나(ADR-0009 Consequences
#: 명시적으로 감수), 조회는 항상 기한 필터를 전제하므로 문제 없다.
_OPPORTUNISTIC_DELETE_EVERY = 100
_insert_count = 0


def _should_run_opportunistic_delete() -> bool:
    global _insert_count
    _insert_count += 1
    return _insert_count % _OPPORTUNISTIC_DELETE_EVERY == 0


async def save_llm_call_log(
    *,
    correlation_id: str | None,
    user_id: uuid.UUID | None,
    task: str | None,
    model: str,
    provider: str,
    messages: list[dict[str, Any]],
    response: str | None,
    error: str | None,
    latency_ms: int,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> None:
    """LLM 호출 1건을 저장한다. 실패해도 예외를 전파하지 않는다."""
    try:
        async with AsyncSessionFactory() as session:
            session.add(
                LLMCallLog(
                    correlation_id=correlation_id,
                    user_id=user_id,
                    task=task,
                    model=model,
                    provider=provider,
                    messages=messages,
                    response=response,
                    error=error,
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
            )
            await session.commit()

            if _should_run_opportunistic_delete():
                cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)
                await session.execute(delete(LLMCallLog).where(LLMCallLog.created_at < cutoff))
                await session.commit()
    except Exception:
        logger.warning("llm_call_log_save_failed", exc_info=True)
