"""전체이용가 모더레이션 처리 (plan.md M4-S1/S2, ai-pipeline.md 6장).

S1(선제 가드) — 사용자 입력에 명백한 19금 키워드가 있으면 LLM 호출 자체를 생략하고
:data:`PRECHECK_DECLINE_MESSAGE`를 반환한다(:func:`is_explicit_content`). 판정
방식은 ai-pipeline.md 6.1이 "미결정, 키워드/분류 모델" 중 가장 단순하다고 명시한
키워드 목록 매칭이다.

S2(거절 정규화 + 완화 재시도) — LLM 호출 결과가 빈 응답이거나 (콘텐츠 정책 거절 등)
알 수 없는 예외면, 시스템 프롬프트에 완화 지시를 덧붙여 1회만 재시도한다
(:func:`stream_with_retry`/:func:`invoke_with_retry`). 재시도도 실패하면
:data:`RETRY_DECLINE_MESSAGE`로 대체한다 — 어느 경우든 provider의 raw 예외
메시지는 호출자에게 노출하지 않는다.

단, 인증·연결·레이트리밋·서버 오류처럼 콘텐츠와 무관함이 분명한 litellm 예외
(:data:`_OPERATIONAL_LLM_ERRORS`)는 완곡 거절로 위장하지 않는다 — 재시도로 고칠 수
없으므로 :class:`LLMUnavailableError`로 표면화해 운영 오류임을 알린다(이 역시 raw
메시지는 노출하지 않고 :data:`LLM_UNAVAILABLE_MESSAGE`만 전달한다).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

import structlog
from fastapi import status
from langchain_core.messages import BaseMessage, SystemMessage
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

#: S1 — 작은 커레이션 키워드 목록. eco: 정교한 분류 모델은 명시적 비목표(plan.md)라
#: 이 이상의 정확도는 추가하지 않는다.
_EXPLICIT_KEYWORDS: tuple[str, ...] = (
    "성기",
    "자지",
    "보지",
    "삽입",
    "정사 장면",
    "애액",
    "사정",
    "강간",
    "성폭행",
    "젖가슴",
)

PRECHECK_DECLINE_MESSAGE = "본 서비스는 전체이용가 수위까지 지원합니다."
RETRY_DECLINE_MESSAGE = (
    "이 장면은 현재 수위 정책 안에서 생성이 어렵습니다. 표현을 순화해 다시 시도해 보세요."
)
SOFTENED_NOTICE = "표현 수위를 조정해 생성했습니다."

_SOFTEN_INSTRUCTION = "직접적인 묘사보다 암시적인 서술로 표현해줘."

LLM_UNAVAILABLE_MESSAGE = (
    "AI 생성 서비스에 일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
)

#: 콘텐츠 정책 거절이 아니라 인프라/인증 실패임이 분명한 litellm 예외들. 완곡 거절
#: (:data:`RETRY_DECLINE_MESSAGE`)로 위장하지 않고 :class:`LLMUnavailableError`로
#: 표면화한다(재시도로 고칠 수 없으므로). 그 외 알 수 없는 예외는 기존대로 삼켜
#: 완화 재시도/완곡 안내로 처리한다(제공사별 콘텐츠 거절 신호가 제각각이라).
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

    콘텐츠 정책 거절(:data:`RETRY_DECLINE_MESSAGE`)과 구별하기 위한 것으로, provider의
    raw 메시지는 담지 않는다 — 사용자에게 노출되는 것은 :data:`LLM_UNAVAILABLE_MESSAGE`
    뿐이다. 스트리밍 엔드포인트는 이를 ``event: error``로, 비스트리밍 엔드포인트는
    :class:`~core.exceptions.AppError` 처리 경로(502)로 표면화한다.
    """

    def __init__(self) -> None:
        super().__init__(LLM_UNAVAILABLE_MESSAGE, status.HTTP_502_BAD_GATEWAY)


def is_explicit_content(text: str) -> bool:
    """*text*에 19금 키워드가 하나라도 있으면 True (S1 선제 가드)."""
    return any(keyword in text for keyword in _EXPLICIT_KEYWORDS)


@dataclass(frozen=True)
class ModerationOutcome:
    """S2 완화 재시도 결과.

    ``declined``가 True면 ``chunks``는 :data:`RETRY_DECLINE_MESSAGE` 하나뿐인
    리스트다. 그 외에는 실제 LLM 출력이며, ``notice``는 완화 재시도로 성공했을
    때만 :data:`SOFTENED_NOTICE`로 채워진다.
    """

    chunks: list[str]
    notice: str | None
    declined: bool


def _soften(messages: list[BaseMessage]) -> list[BaseMessage]:
    """시스템 프롬프트에 완화 지시를 덧붙인 새 메시지 목록(원본은 불변)."""
    if not messages or not isinstance(messages[0], SystemMessage):
        return [SystemMessage(content=_SOFTEN_INSTRUCTION), *messages]
    softened = SystemMessage(content=f"{messages[0].content}\n{_SOFTEN_INSTRUCTION}")
    return [softened, *messages[1:]]


async def _live_stream(llm: AbstractLLMPort, messages: list[BaseMessage]) -> AsyncIterator[str]:
    """청크를 도착 즉시 yield(진짜 스트리밍) — 예외는 삼키고 로그만 남긴다.

    :func:`stream_with_retry`가 "한 글자도 못 받았는가"만으로 재시도 여부를 판단하므로
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
        logger.warning("moderation_stream_refused", error=str(exc))


async def _safe_invoke(llm: AbstractLLMPort, messages: list[BaseMessage]) -> str:
    """단발 호출 결과 텍스트. 예외/빈 응답은 빈 문자열로 눌러 담는다."""
    try:
        response = await llm.invoke(messages)
    except _OPERATIONAL_LLM_ERRORS as exc:
        logger.warning("moderation_llm_unavailable", error=str(exc))
        raise LLMUnavailableError from exc
    except Exception as exc:
        logger.warning("moderation_invoke_refused", error=str(exc))
        return ""
    return str(response.content).strip()


async def stream_with_retry(
    llm: AbstractLLMPort, messages: list[BaseMessage]
) -> AsyncIterator[str]:
    """스트리밍 호출 + S2 완화 재시도 1회 (assist 엔드포인트가 쓴다).

    받는 즉시 청크를 yield해 실제 진행형 스트리밍을 유지한다 — 첫 시도에서 한
    글자도 못 받았을 때만 완화 프롬프트로 재시도한다(역시 스트리밍). 이미 일부라도
    보낸 뒤 중간에 끊기면 재시도하지 않고 그대로 종료한다 — 이미 스트리밍된 내용을
    되돌릴 수 없어, 뒤늦은 재시도 결과를 덧붙이면 사용자에게 더 혼란스럽다.
    """
    got_any = False
    async for chunk in _live_stream(llm, messages):
        got_any = True
        yield chunk
    if got_any:
        return

    got_any = False
    async for chunk in _live_stream(llm, _soften(messages)):
        if not got_any:
            yield SOFTENED_NOTICE
        got_any = True
        yield chunk
    if got_any:
        return

    yield RETRY_DECLINE_MESSAGE


async def invoke_with_retry(llm: AbstractLLMPort, messages: list[BaseMessage]) -> ModerationOutcome:
    """단발 호출 + S2 완화 재시도 1회 (dynamic_update 추출이 쓴다)."""
    text = await _safe_invoke(llm, messages)
    if text:
        return ModerationOutcome(chunks=[text], notice=None, declined=False)

    text = await _safe_invoke(llm, _soften(messages))
    if text:
        return ModerationOutcome(chunks=[text], notice=SOFTENED_NOTICE, declined=False)

    return ModerationOutcome(chunks=[RETRY_DECLINE_MESSAGE], notice=None, declined=True)
