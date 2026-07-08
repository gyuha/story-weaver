"""집필 보조 5개 작업 HTTP 라우터 (plan.md M3-S3).

``POST /api/v1/works/{work_id}/scenes/{scene_id}/assist/{continue|infill|dialogue|
style|correct}`` — memory_router.py와 동일 패턴: ``get_current_user``로 인증하고,
교차 테넌트 접근은 404(ADR-0005). 요청 스키마는 chat_router.py처럼 라우터 모듈에
직접 둔다(작업별 입력 모양이 서로 다르고 재사용되지 않아 별도 schemas 모듈은
과함 — ``assist/schemas/assist_schemas.py``는 prompt_assembler 내부 타입 전용).

각 엔드포인트는 (1) S1 프롬프트 조립기로 요청을 조립하고, (2) S2 티어 라우팅으로
작업에 맞는 LLM 클라이언트를 고른 뒤, (3) chat_router.py의 SSE 스트리밍 패턴을
그대로 미러링해(``EventSourceResponse``, ``[DONE]`` sentinel) 응답한다.
"""

from __future__ import annotations

import uuid
from typing import Any, NoReturn

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from core.database import get_async_session
from core.exceptions import AppError
from core.rate_limit import LLM_RATE_LIMIT, limiter
from domains.assist import correct_cache
from domains.assist.schemas import (
    ContinueInput,
    CorrectInput,
    DialogueInput,
    InfillInput,
    StyleInput,
)
from domains.assist.service.assist_service import AssistService
from domains.assist.tier_routing import TaskType, get_fast_writing_client
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.dependency import require_budget_available
from domains.budget.service import estimate_tokens, record_usage
from domains.chat.ports import AbstractLLMPort
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.memory.service.memory_search_service import MemorySearchService
from domains.moderation.service import (
    PRECHECK_DECLINE_MESSAGE,
    RETRY_DECLINE_MESSAGE,
    is_explicit_content,
    stream_with_retry,
)
from domains.timeline.repository import TimelineRepository
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/works/{work_id}/scenes/{scene_id}/assist", tags=["assist"])


# ---------------------------------------------------------------------------
# Request schemas (작업별 입력 — ai-pipeline.md 3.1 표 "사용자 입력" 열)
# ---------------------------------------------------------------------------


class _CamelModel(BaseModel):
    """camelCase 입력 (worldbible_schemas.py 등과 동일 패턴)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ContinueRequest(_CamelModel):
    cursor_text: str


class InfillRequest(_CamelModel):
    before_text: str
    after_text: str


class DialogueRequest(_CamelModel):
    intent: str
    target_entity_id: uuid.UUID


class StyleRequest(_CamelModel):
    text: str
    target_style: str


class CorrectRequest(_CamelModel):
    text: str


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> AssistService:
    works_service = WorksService(WorksRepository(session))
    memory_service = MemoryService(MemoryRepository(session))
    worldbible_service = WorldBibleService(
        WorldBibleRepository(session), works_service, memory_service
    )
    manuscript_service = ManuscriptService(
        ManuscriptRepository(session), works_service, memory_service
    )
    timeline_service = TimelineService(
        TimelineRepository(session), worldbible_service, manuscript_service
    )
    memory_search_service = MemorySearchService(
        MemoryRepository(session), worldbible_service, manuscript_service, timeline_service
    )
    return AssistService(
        works_service, manuscript_service, worldbible_service, memory_search_service
    )


# thinking 모드를 끈 전용 LLM 클라이언트를 고르는 의존성(tier_routing.get_fast_writing_client
# 참고). 라우트마다 별도 함수 객체로 둬야 테스트에서 ``app.dependency_overrides``로
# 개별 override 가능.
def _continue_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


def _infill_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


def _dialogue_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


def _style_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


def _correct_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


async def _bind_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수(``core.rate_limit._get_user_key``)가 읽는
    ``request.state.user``를 인증된 사용자로 채운다(plan.md M4-S3).
    """
    request.state.user = current_user


# ---------------------------------------------------------------------------
# SSE helper — chat_router.py의 ``_event_generator``와 동일 패턴
# ---------------------------------------------------------------------------


async def _stream_response(llm: AbstractLLMPort, messages: list[Any], user_id: uuid.UUID) -> Any:
    """LLM 응답을 SSE ``data`` 이벤트로 스트리밍하고, 끝나면 ``[DONE]`` sentinel.

    LLM 호출은 moderation 도메인의 완화 재시도(plan.md M4-S2)를 거친다 — 거절/빈
    응답이면 완화 프롬프트로 1회 재시도하고, 성공하면 안내(``SOFTENED_NOTICE``)를
    첫 조각으로 흘려보낸다. 재시도도 실패하면 완곡 안내 문구를 정상 콘텐츠처럼
    스트리밍한다(raw provider 예외는 이 시점에 이미 moderation 쪽에서 삼켜진다).
    ``stream_with_retry``는 청크를 도착 즉시 yield하므로(진짜 스트리밍 유지) 여기서도
    모아 담지 않고 그대로 중계한다.

    실제 생성 결과가 나온 경우에만 budget 도메인(plan.md M4-S1)에 사용량을
    기록한다(완곡 안내만 나온 경우는 제외). ``AbstractLLMPort.stream()``은 평문 str
    청크만 내보내 사용량 메타데이터가 없으므로(eco) 응답 텍스트 길이 기반 근사치
    (``estimate_tokens``)를 쓴다.
    """
    try:
        sent: list[str] = []
        async for chunk in stream_with_retry(llm, messages):
            sent.append(chunk)
            yield {"data": chunk}
        yield {"data": "[DONE]"}
        combined = "".join(sent)
        if combined and combined != RETRY_DECLINE_MESSAGE:
            await record_usage(user_id, estimate_tokens(combined))
    except Exception as exc:
        logger.error("assist_stream_error", error=str(exc), exc_info=True)
        yield {"event": "error", "data": str(exc)}


async def _precheck_declined_stream() -> Any:
    """S1 선제 가드가 걸렸을 때의 SSE 응답 — LLM을 아예 호출하지 않는다."""
    yield {"data": PRECHECK_DECLINE_MESSAGE}
    yield {"data": "[DONE]"}


async def _stream_cached_chunks(chunks: list[str]) -> Any:
    """M4-S2 캐시 히트 — 캐시된 청크를 그대로 재생한다(LLM 미호출)."""
    for chunk in chunks:
        yield {"data": chunk}
    yield {"data": "[DONE]"}


async def _stream_and_cache_correct(
    llm: AbstractLLMPort,
    messages: list[Any],
    user_id: uuid.UUID,
    work_id: uuid.UUID,
    text: str,
) -> Any:
    """``_stream_response``를 그대로 중계하면서, 성공한 청크만 모아 캐시에 저장한다(M4-S2).

    오류 이벤트가 나오면 캐싱하지 않는다(실패 결과를 캐시하지 않기 위함).
    """
    chunks: list[str] = []
    async for event in _stream_response(llm, messages, user_id):
        if event.get("event") == "error":
            yield event
            return
        data = event["data"]
        if data != "[DONE]":
            chunks.append(data)
        yield event
    if chunks:
        await correct_cache.set_cached(work_id, text, chunks)


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/continue",
    summary="이어쓰기 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def assist_continue(
    request: Request,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: ContinueRequest,
    current_user: User = Depends(get_current_user),
    service: AssistService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_continue_llm_client),
) -> EventSourceResponse:
    if is_explicit_content(payload.cursor_text):
        return EventSourceResponse(_precheck_declined_stream())
    try:
        messages = await service.build_messages(
            work_id,
            current_user.id,
            scene_id,
            TaskType.continue_,
            ContinueInput(cursor_text=payload.cursor_text),
        )
    except AppError as exc:
        _raise_http(exc)
    return EventSourceResponse(_stream_response(llm, messages, current_user.id))


@router.post(
    "/infill",
    summary="인필링 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def assist_infill(
    request: Request,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: InfillRequest,
    current_user: User = Depends(get_current_user),
    service: AssistService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_infill_llm_client),
) -> EventSourceResponse:
    if is_explicit_content(f"{payload.before_text} {payload.after_text}"):
        return EventSourceResponse(_precheck_declined_stream())
    try:
        messages = await service.build_messages(
            work_id,
            current_user.id,
            scene_id,
            TaskType.infill,
            InfillInput(before_text=payload.before_text, after_text=payload.after_text),
        )
    except AppError as exc:
        _raise_http(exc)
    return EventSourceResponse(_stream_response(llm, messages, current_user.id))


@router.post(
    "/dialogue",
    summary="지문/대사 변환 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def assist_dialogue(
    request: Request,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: DialogueRequest,
    current_user: User = Depends(get_current_user),
    service: AssistService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_dialogue_llm_client),
) -> EventSourceResponse:
    if is_explicit_content(payload.intent):
        return EventSourceResponse(_precheck_declined_stream())
    try:
        character = await service.resolve_character_profile(
            work_id, current_user.id, payload.target_entity_id
        )
        messages = await service.build_messages(
            work_id,
            current_user.id,
            scene_id,
            TaskType.dialogue,
            DialogueInput(intent=payload.intent, characters=[character]),
        )
    except AppError as exc:
        _raise_http(exc)
    return EventSourceResponse(_stream_response(llm, messages, current_user.id))


@router.post(
    "/style",
    summary="문체 변환 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def assist_style(
    request: Request,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: StyleRequest,
    current_user: User = Depends(get_current_user),
    service: AssistService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_style_llm_client),
) -> EventSourceResponse:
    if is_explicit_content(payload.text):
        return EventSourceResponse(_precheck_declined_stream())
    try:
        messages = await service.build_messages(
            work_id,
            current_user.id,
            scene_id,
            TaskType.style,
            StyleInput(text=payload.text, target_style=payload.target_style),
        )
    except AppError as exc:
        _raise_http(exc)
    return EventSourceResponse(_stream_response(llm, messages, current_user.id))


@router.post(
    "/correct",
    summary="교정 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def assist_correct(
    request: Request,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: CorrectRequest,
    current_user: User = Depends(get_current_user),
    service: AssistService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_correct_llm_client),
) -> EventSourceResponse:
    if is_explicit_content(payload.text):
        return EventSourceResponse(_precheck_declined_stream())
    try:
        # 소유권/씬 존재 확인(ADR-0005)은 캐시 히트 여부와 무관하게 항상 거친다 —
        # LLM은 안 부르더라도 다른 테넌트의 캐시된 결과가 새어나가면 안 된다.
        # correct는 메모리 검색을 안 하므로(S3) 이 호출 자체는 비용이 들지 않는다.
        messages = await service.build_messages(
            work_id, current_user.id, scene_id, TaskType.correct, CorrectInput(text=payload.text)
        )
    except AppError as exc:
        _raise_http(exc)
    cached = await correct_cache.get_cached(work_id, payload.text)
    if cached is not None:
        return EventSourceResponse(_stream_cached_chunks(cached))
    return EventSourceResponse(
        _stream_and_cache_correct(llm, messages, current_user.id, work_id, payload.text)
    )
