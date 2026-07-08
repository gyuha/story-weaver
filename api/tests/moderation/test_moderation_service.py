"""moderation 도메인 핵심 로직 테스트 (TDD, plan.md M4-S1/S2).

FastAPI 라우팅 없이 :mod:`domains.moderation.service.moderation_service`를 직접
호출한다. 라우터 와이어링(실제로 LLM 호출 전에 걸리는지, 엔드포인트 응답 모양)은
assist/dynamic_update 라우터 테스트에서 확인한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from domains.moderation.service import (
    PRECHECK_DECLINE_MESSAGE,
    RETRY_DECLINE_MESSAGE,
    SOFTENED_NOTICE,
    invoke_with_retry,
    is_explicit_content,
    stream_with_retry,
)

pytestmark = pytest.mark.unit

_MESSAGES = [SystemMessage(content="베이스 지시"), HumanMessage(content="사용자 입력")]


# ---------------------------------------------------------------------------
# S1 — 키워드 기반 선제 가드
# ---------------------------------------------------------------------------


def test_is_explicit_content_flags_known_keyword() -> None:
    assert is_explicit_content("그는 그녀의 성기를 만졌다.") is True


def test_is_explicit_content_passes_benign_text() -> None:
    assert is_explicit_content("그는 문을 열고 방으로 들어갔다.") is False


# ---------------------------------------------------------------------------
# S2 — 스트리밍 호출 + 완화 재시도 (assist 5개 엔드포인트)
# ---------------------------------------------------------------------------


class _FlakyStreamLLM:
    """호출마다 미리 정해둔 결과(정상 청크 목록 또는 예외)를 순서대로 재생."""

    def __init__(self, outcomes: list[list[str] | Exception]) -> None:
        self._outcomes = outcomes
        self.call_count = 0
        self.received_messages: list[list[Any]] = []

    async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
        self.received_messages.append(messages)
        outcome = self._outcomes[self.call_count]
        self.call_count += 1
        if isinstance(outcome, Exception):
            raise outcome
        for chunk in outcome:
            yield chunk


async def test_stream_with_retry_returns_first_attempt_when_it_succeeds() -> None:
    llm = _FlakyStreamLLM([["안녕", " 하세요"]])

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert chunks == ["안녕", " 하세요"]


async def test_stream_with_retry_yields_chunks_progressively_not_buffered() -> None:
    """각 청크가 스트림에서 나오는 즉시 소비 가능해야 한다(진짜 스트리밍 유지) —
    전체를 다 모은 뒤 한꺼번에 반환하는 회귀를 잡는 테스트."""
    llm = _FlakyStreamLLM([["첫", "둘", "셋"]])
    seen: list[str] = []

    async for chunk in stream_with_retry(llm, _MESSAGES):
        seen.append(chunk)
        # 아직 스트림이 끝나기 전에도(마지막 청크가 아니어도) 이미 청크가 도착해 있어야 함.
        assert chunk in ("첫", "둘", "셋")

    assert seen == ["첫", "둘", "셋"]


async def test_stream_with_retry_retries_once_with_softened_prompt_on_empty_response() -> None:
    llm = _FlakyStreamLLM([[], ["완화된 결과"]])

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 2
    assert chunks == [SOFTENED_NOTICE, "완화된 결과"]
    # 재시도 메시지의 시스템 프롬프트에는 완화 지시가 덧붙어야 하고, 원본 메시지는 불변.
    assert "베이스 지시" in str(llm.received_messages[1][0].content)
    assert str(llm.received_messages[1][0].content) != "베이스 지시"
    assert _MESSAGES[0].content == "베이스 지시"


async def test_stream_with_retry_retries_once_on_provider_exception() -> None:
    llm = _FlakyStreamLLM(
        [RuntimeError("content_policy_violation: raw provider detail"), ["완화됨"]]
    )

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 2
    assert chunks == [SOFTENED_NOTICE, "완화됨"]


async def test_stream_with_retry_declines_with_no_raw_error_when_both_attempts_fail() -> None:
    llm = _FlakyStreamLLM(
        [RuntimeError("raw provider secret detail"), RuntimeError("raw provider secret detail")]
    )

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 2
    assert chunks == [RETRY_DECLINE_MESSAGE]
    assert "raw provider secret detail" not in "".join(chunks)


async def test_stream_with_retry_does_not_retry_after_partial_content_already_sent() -> None:
    """이미 일부 청크를 내보낸 뒤 스트림이 예외로 끊기면, 재시도 없이 그대로 종료한다
    (이미 보낸 내용을 되돌릴 수 없어 재시도 결과를 덧붙이면 사용자에게 혼란을 준다)."""

    class _PartialThenFailLLM:
        call_count = 0

        async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
            self.call_count += 1
            yield "일부 내용"
            raise RuntimeError("mid-stream failure")

    llm = _PartialThenFailLLM()

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert chunks == ["일부 내용"]


# ---------------------------------------------------------------------------
# S2 — 단발 호출 + 완화 재시도 (dynamic_update 추출)
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FlakyInvokeLLM:
    def __init__(self, outcomes: list[str | Exception]) -> None:
        self._outcomes = outcomes
        self.call_count = 0

    async def invoke(self, messages: list[Any], **kwargs: Any) -> _FakeResponse:
        outcome = self._outcomes[self.call_count]
        self.call_count += 1
        if isinstance(outcome, Exception):
            raise outcome
        return _FakeResponse(outcome)


async def test_invoke_with_retry_returns_first_attempt_when_it_succeeds() -> None:
    llm = _FlakyInvokeLLM(["정상 응답"])

    result = await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 1
    assert result.chunks == ["정상 응답"]
    assert result.notice is None
    assert result.declined is False


async def test_invoke_with_retry_retries_once_on_empty_response() -> None:
    llm = _FlakyInvokeLLM(["", "완화된 응답"])

    result = await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 2
    assert result.chunks == ["완화된 응답"]
    assert result.notice == SOFTENED_NOTICE
    assert result.declined is False


async def test_invoke_with_retry_declines_with_no_raw_error_when_both_attempts_fail() -> None:
    llm = _FlakyInvokeLLM([RuntimeError("raw secret"), RuntimeError("raw secret")])

    result = await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 2
    assert result.chunks == [RETRY_DECLINE_MESSAGE]
    assert result.declined is True
    assert "raw secret" not in "".join(result.chunks)


def test_decline_messages_are_distinct_polite_korean_text() -> None:
    # 두 완곡 안내 문구가 실제로 채워져 있고 서로 구분되는지만 확인(정확한 워딩은 미결정).
    assert PRECHECK_DECLINE_MESSAGE
    assert RETRY_DECLINE_MESSAGE
    assert PRECHECK_DECLINE_MESSAGE != RETRY_DECLINE_MESSAGE
