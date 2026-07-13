"""llm_call_log_repository 실 DB 테스트 (plan.md S1).

저장 필드 검증, 예외 시 전파 안 됨, 30일 경과 행의 기회적 삭제를 확인한다
(manuscript/works 도메인의 실 DB 테스트 패턴 — `core.database.AsyncSessionFactory`를
그대로 사용).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select

from core.database import AsyncSessionFactory, engine
from domains.chat.models import LLMCallLog
from domains.chat.repository import llm_call_log_repository as repo


@pytest.fixture(autouse=True)
async def _clean_llm_call_logs() -> AsyncIterator[None]:
    """이 테이블은 이 모듈이 전담하므로, 테스트 간 행이 누적되지 않게 앞뒤로 비운다
    (scalar_one() 류 단건 조회가 이전 실행분과 충돌하지 않도록). 마지막에 풀을
    비워(engine.dispose) 다음 테스트가 새 이벤트 루프에서 새 커넥션을 열게 한다
    (manuscript/works 도메인과 동일 패턴 — 두 관심사를 한 fixture로 묶어 autouse
    fixture 간 teardown 순서 문제를 피한다)."""
    async with AsyncSessionFactory() as session:
        await session.execute(delete(LLMCallLog))
        await session.commit()
    yield
    async with AsyncSessionFactory() as session:
        await session.execute(delete(LLMCallLog))
        await session.commit()
    await engine.dispose()


@pytest.fixture(autouse=True)
def _reset_insert_counter() -> None:
    """모듈 카운터를 테스트마다 0으로 리셋해 기회적 삭제 트리거를 결정적으로 만든다."""
    repo._insert_count = 0


async def test_save_llm_call_log_persists_fields() -> None:
    user_id = uuid.uuid4()
    await repo.save_llm_call_log(
        correlation_id="corr-1",
        user_id=user_id,
        task="assist.continue",
        model="openai/gpt-4o-mini",
        provider="openai",
        messages=[{"role": "user", "content": "hello"}],
        response="hi there",
        error=None,
        latency_ms=123,
        prompt_tokens=10,
        completion_tokens=5,
    )

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(LLMCallLog).where(LLMCallLog.correlation_id == "corr-1")
        )
        row = result.scalar_one()

    assert row.user_id == user_id
    assert row.task == "assist.continue"
    assert row.model == "openai/gpt-4o-mini"
    assert row.provider == "openai"
    assert row.messages == [{"role": "user", "content": "hello"}]
    assert row.response == "hi there"
    assert row.error is None
    assert row.latency_ms == 123
    assert row.prompt_tokens == 10
    assert row.completion_tokens == 5
    assert row.created_at is not None


async def test_save_llm_call_log_allows_nullable_context() -> None:
    """correlation_id/user_id/task가 없어도(백그라운드 호출) 저장은 성공한다."""
    await repo.save_llm_call_log(
        correlation_id=None,
        user_id=None,
        task=None,
        model="ollama/llama3.2",
        provider="ollama",
        messages=[],
        response=None,
        error="RateLimitError",
        latency_ms=5,
    )

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(LLMCallLog).where(LLMCallLog.error == "RateLimitError")
        )
        row = result.scalar_one()

    assert row.correlation_id is None
    assert row.user_id is None
    assert row.task is None
    assert row.prompt_tokens is None
    assert row.completion_tokens is None


async def test_save_llm_call_log_does_not_propagate_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """세션 팩토리가 터져도 fire-and-forget이므로 예외가 호출자에게 전파되지 않는다."""

    def _boom() -> None:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(repo, "AsyncSessionFactory", _boom)

    await repo.save_llm_call_log(
        correlation_id=None,
        user_id=None,
        task=None,
        model="m",
        provider="p",
        messages=[],
        response=None,
        error=None,
        latency_ms=1,
    )  # 예외 없이 반환되면 통과


async def test_opportunistic_delete_removes_rows_past_retention() -> None:
    """100번째 저장 시점에 30일 경과 행이 삭제되고, 최근 행은 남는다."""
    old_id = uuid.uuid4()
    async with AsyncSessionFactory() as session:
        old_row = LLMCallLog(
            id=old_id,
            created_at=datetime.now(UTC) - timedelta(days=31),
            model="m",
            provider="p",
            messages=[],
            latency_ms=1,
        )
        session.add(old_row)
        await session.commit()

    repo._insert_count = repo._OPPORTUNISTIC_DELETE_EVERY - 1  # 다음 저장이 100번째가 되게

    await repo.save_llm_call_log(
        correlation_id=None,
        user_id=None,
        task=None,
        model="m2",
        provider="p2",
        messages=[],
        response=None,
        error=None,
        latency_ms=2,
    )

    async with AsyncSessionFactory() as session:
        old_result = await session.execute(select(LLMCallLog).where(LLMCallLog.id == old_id))
        assert old_result.scalar_one_or_none() is None

        recent_result = await session.execute(select(LLMCallLog).where(LLMCallLog.model == "m2"))
        assert recent_result.scalar_one_or_none() is not None
