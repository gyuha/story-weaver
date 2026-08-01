"""moderation 도메인 핵심 로직 테스트 (ADR `260730-070532`).

이 도메인은 콘텐츠 수위를 판정하지 않는다 — 남은 책임은 LLM 호출 실패를 운영 실패와
제공자 거절로 갈라 사용자 대면 처리를 정하는 것이다.

FastAPI 라우팅 없이 :mod:`domains.moderation.service.moderation_service`를 직접
호출한다. 라우터 와이어링(실제로 LLM 호출 전에 걸리는지, 엔드포인트 응답 모양)은
assist/dynamic_update 라우터 테스트에서 확인한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import litellm
import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from domains.moderation.service import (
    LLM_UNAVAILABLE_MESSAGE,
    PROVIDER_DECLINE_MESSAGE,
    LLMUnavailableError,
    invoke_with_retry,
    stream_with_retry,
)

pytestmark = pytest.mark.unit

_MESSAGES = [SystemMessage(content="베이스 지시"), HumanMessage(content="사용자 입력")]


# ---------------------------------------------------------------------------
# 스트리밍 호출 — 완화 재시도 없음, 아무것도 못 받으면 제공자 거절 안내
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


async def test_stream_declines_on_empty_response_without_retry() -> None:
    """빈 응답이면 제공자 거절로 판정 — 완화 프롬프트 재시도를 하지 않는다."""
    llm = _FlakyStreamLLM([[], ["도달하면 안 되는 재시도 결과"]])

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert chunks == [PROVIDER_DECLINE_MESSAGE]
    # 원본 메시지는 불변이고 완화 지시가 덧붙지 않는다.
    assert str(llm.received_messages[0][0].content) == "베이스 지시"
    assert _MESSAGES[0].content == "베이스 지시"


async def test_stream_declines_with_no_raw_error_on_provider_exception() -> None:
    llm = _FlakyStreamLLM([RuntimeError("raw provider secret detail")])

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert chunks == [PROVIDER_DECLINE_MESSAGE]
    assert "raw provider secret detail" not in "".join(chunks)
    assert "수위" not in "".join(chunks)


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
# 단발 호출 — 완화 재시도 없음
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
    assert result.declined is False


async def test_invoke_declines_on_empty_response_without_retry() -> None:
    llm = _FlakyInvokeLLM(["", "도달하면 안 되는 재시도 결과"])

    result = await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 1
    assert result.chunks == [PROVIDER_DECLINE_MESSAGE]
    assert result.declined is True


async def test_invoke_declines_with_no_raw_error_on_provider_exception() -> None:
    llm = _FlakyInvokeLLM([RuntimeError("raw secret")])

    result = await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 1
    assert result.chunks == [PROVIDER_DECLINE_MESSAGE]
    assert result.declined is True
    assert "raw secret" not in "".join(result.chunks)


def test_decline_message_does_not_blame_content_rating() -> None:
    """거절 안내가 우리 수위 정책 탓으로 읽히지 않아야 한다(이번 사고의 근본)."""
    assert PROVIDER_DECLINE_MESSAGE
    assert "수위" not in PROVIDER_DECLINE_MESSAGE
    assert "전체이용가" not in PROVIDER_DECLINE_MESSAGE
    assert PROVIDER_DECLINE_MESSAGE != LLM_UNAVAILABLE_MESSAGE


# ---------------------------------------------------------------------------
# 운영 에러(인증·레이트리밋·연결 등)는 제공자 거절로 위장하지 않고 502로 표면화한다
# — 이 경로는 수위 제거와 무관한 인프라 기능이므로 반드시 보존된다
# ---------------------------------------------------------------------------


async def test_stream_with_retry_raises_on_operational_error_without_retry() -> None:
    """인증 실패 등 운영 예외는 제공자 거절로 삼키지 않고 LLMUnavailableError로 올린다."""
    auth_err = litellm.AuthenticationError(
        message="token expired or incorrect",
        llm_provider="openai_compatible",
        model="cx/gpt-5.6-terra",
    )
    llm = _FlakyStreamLLM([auth_err])

    with pytest.raises(LLMUnavailableError) as excinfo:
        [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    # raw provider 메시지는 노출하지 않고, 일반화된 안내만 담는다.
    assert "token expired or incorrect" not in str(excinfo.value)
    assert str(excinfo.value) == LLM_UNAVAILABLE_MESSAGE


async def test_stream_declines_on_content_policy_violation_without_retry() -> None:
    """콘텐츠 정책 위반은 운영 에러가 아니므로 제공자 거절 경로 — 재시도는 없다."""
    policy_err = litellm.ContentPolicyViolationError(
        message="content_policy_violation", llm_provider="openai", model="gpt-4o-mini"
    )
    llm = _FlakyStreamLLM([policy_err])

    chunks = [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert chunks == [PROVIDER_DECLINE_MESSAGE]


async def test_invoke_with_retry_raises_on_operational_error_without_retry() -> None:
    rate_err = litellm.RateLimitError(
        message="rate limit raw detail", llm_provider="openai", model="gpt-4o-mini"
    )
    llm = _FlakyInvokeLLM([rate_err])

    with pytest.raises(LLMUnavailableError) as excinfo:
        await invoke_with_retry(llm, _MESSAGES)

    assert llm.call_count == 1
    assert "rate limit raw detail" not in str(excinfo.value)
    assert str(excinfo.value) == LLM_UNAVAILABLE_MESSAGE


async def test_stream_raises_on_connection_error_without_retry() -> None:
    """연결 실패도 운영 실패다 — 제공자 거절로 위장하면 원인 진단이 불가능해진다."""
    conn_err = litellm.APIConnectionError(
        message="connection refused raw detail",
        llm_provider="openai_compatible",
        model="cx/gpt-5.6-terra",
    )
    llm = _FlakyStreamLLM([conn_err])

    with pytest.raises(LLMUnavailableError) as excinfo:
        [c async for c in stream_with_retry(llm, _MESSAGES)]

    assert llm.call_count == 1
    assert "connection refused raw detail" not in str(excinfo.value)
    assert str(excinfo.value) == LLM_UNAVAILABLE_MESSAGE
