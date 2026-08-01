"""LLM 호출 실패 분류 (ADR `260730-070532`).

이 도메인은 **콘텐츠 수위를 판정하지 않는다.** 과거에는 전체이용가 상한을 강제하는
S1(키워드 선제 가드)과 S2(완화 재시도)를 담았으나, ADR `260730-070532`으로 제품이
강제하는 연령·수위 제한을 전부 제거했다 — 콘텐츠 정책의 집행은 모델 제공자에게
위임한다. 도메인 이름은 리네임 비용을 피해 그대로 두었다(같은 ADR의 결정).

남은 책임은 **LLM 호출 실패를 두 부류로 갈라 사용자 대면 처리를 정하는 것**이다.

* **운영 실패** — 인증·권한·연결·레이트리밋·서버 오류처럼 콘텐츠와 무관함이 분명한
  litellm 예외(:data:`_OPERATIONAL_LLM_ERRORS`). :class:`LLMUnavailableError`로
  표면화해 502로 알린다. provider의 raw 메시지는 노출하지 않고
  :data:`LLM_UNAVAILABLE_MESSAGE`만 전달한다.
* **제공자 거절** — 빈 응답이거나 그 외 알 수 없는 예외. 제공사별 콘텐츠 거절 신호가
  제각각이라 예외 타입으로 구분할 수 없으므로 "생성물이 없다"는 사실로 판정하고
  :data:`PROVIDER_DECLINE_MESSAGE`를 전달한다. **자동 완화 재시도는 하지 않는다** —
  작가가 쓴 수위를 시스템이 낮추지 않는다(ADR `260730-070532`).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

import structlog
from fastapi import status
from langchain_core.messages import BaseMessage
from litellm.exceptions import (
    APIConnectionError,
    AuthenticationError,
    BadGatewayError,
    InternalServerError,
    PermissionDeniedError,
    RateLimitError,
    ServiceUnavailableError,
    Timeout,
)

from core.exceptions import AppError
from domains.chat.ports import AbstractLLMPort

logger = structlog.get_logger(__name__)

#: 모델 제공자가 생성을 거절했을 때(빈 응답 등) 사용자에게 전달하는 문구. 우리 서비스의
#: 수위 정책이 아니라 제공자의 판단임이 드러나야 한다 — 과거처럼 "전체이용가 수위"로
#: 오표시하면 사용자가 원인을 오해한다(ADR `260730-070532`).
PROVIDER_DECLINE_MESSAGE = (
    "AI 모델이 이 요청의 생성을 거절했습니다. 서비스의 제한이 아니라 모델 제공자의 판단입니다."
)

LLM_UNAVAILABLE_MESSAGE = (
    "AI 생성 서비스에 일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
)

#: 콘텐츠 거절이 아니라 인프라/인증 실패임이 분명한 litellm 예외들. 제공자 거절
#: (:data:`PROVIDER_DECLINE_MESSAGE`)로 위장하지 않고 :class:`LLMUnavailableError`로
#: 표면화한다(재시도로 고칠 수 없으므로). 그 외 알 수 없는 예외는 제공자 거절로 본다.
_OPERATIONAL_LLM_ERRORS: tuple[type[Exception], ...] = (
    AuthenticationError,
    PermissionDeniedError,
    RateLimitError,
    ServiceUnavailableError,
    InternalServerError,
    BadGatewayError,
    APIConnectionError,
    Timeout,
)


class LLMUnavailableError(AppError):
    """LLM 호출이 운영상 실패(인증·연결·레이트리밋·서버 오류 등)했음을 알리는 예외.

    제공자의 콘텐츠 거절(:data:`PROVIDER_DECLINE_MESSAGE`)과 구별하기 위한 것으로,
    provider의 raw 메시지는 담지 않는다 — 사용자에게 노출되는 것은
    :data:`LLM_UNAVAILABLE_MESSAGE` 뿐이다. 스트리밍 엔드포인트는 이를 ``event: error``로,
    비스트리밍 엔드포인트는 :class:`~core.exceptions.AppError` 처리 경로(502)로 표면화한다.
    """

    def __init__(self) -> None:
        super().__init__(LLM_UNAVAILABLE_MESSAGE, status.HTTP_502_BAD_GATEWAY)


@dataclass(frozen=True)
class ModerationOutcome:
    """단발 호출 결과.

    ``declined``가 True면 ``chunks``는 :data:`PROVIDER_DECLINE_MESSAGE` 하나뿐인
    리스트다. 그 외에는 실제 LLM 출력이다.
    """

    chunks: list[str]
    declined: bool


async def _live_stream(llm: AbstractLLMPort, messages: list[BaseMessage]) -> AsyncIterator[str]:
    """청크를 도착 즉시 yield(진짜 스트리밍) — 운영 예외만 올리고 나머지는 로그만 남긴다.

    :func:`stream_with_retry`가 "한 글자도 못 받았는가"로 제공자 거절을 판정하므로
    여기서는 빈 문자열 청크만 걸러내고 그대로 흘려보낸다.
    """
    try:
        async for chunk in llm.stream(messages):
            if chunk:
                yield chunk
    except _OPERATIONAL_LLM_ERRORS as exc:
        logger.warning("moderation_llm_unavailable", error=str(exc))
        raise LLMUnavailableError from exc
    except Exception as exc:
        logger.warning("moderation_stream_declined", error=str(exc))


async def _safe_invoke(llm: AbstractLLMPort, messages: list[BaseMessage]) -> str:
    """단발 호출 결과 텍스트. 운영 예외만 올리고, 그 외 예외/빈 응답은 빈 문자열."""
    try:
        response = await llm.invoke(messages)
    except _OPERATIONAL_LLM_ERRORS as exc:
        logger.warning("moderation_llm_unavailable", error=str(exc))
        raise LLMUnavailableError from exc
    except Exception as exc:
        logger.warning("moderation_invoke_declined", error=str(exc))
        return ""
    return str(response.content).strip()


async def stream_with_retry(
    llm: AbstractLLMPort, messages: list[BaseMessage]
) -> AsyncIterator[str]:
    """스트리밍 호출 1회 — 아무것도 못 받으면 제공자 거절 안내를 흘린다.

    받는 즉시 청크를 yield해 실제 진행형 스트리밍을 유지한다. **완화 재시도는 하지
    않는다**(ADR `260730-070532`) — 일부라도 받은 뒤 중간에 끊기면 그대로 종료하고
    거절 안내를 덧붙이지 않는다(이미 스트리밍된 내용을 되돌릴 수 없어 더 혼란스럽다).

    이름의 ``_with_retry``는 재시도가 사라진 뒤에도 호출부 6곳을 건드리지 않기 위해
    유지한 것이다 — 실제로 재시도하지 않는다.
    """
    got_any = False
    async for chunk in _live_stream(llm, messages):
        got_any = True
        yield chunk
    if not got_any:
        yield PROVIDER_DECLINE_MESSAGE


async def invoke_with_retry(llm: AbstractLLMPort, messages: list[BaseMessage]) -> ModerationOutcome:
    """단발 호출 1회 — 빈 응답이면 제공자 거절로 판정한다(완화 재시도 없음)."""
    text = await _safe_invoke(llm, messages)
    if text:
        return ModerationOutcome(chunks=[text], declined=False)
    return ModerationOutcome(chunks=[PROVIDER_DECLINE_MESSAGE], declined=True)
