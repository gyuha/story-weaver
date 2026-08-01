"""원고 계층 HTTP 라우터 — ``/api/v1/works/{work_id}/{synopsis,episodes,...}``.

works_router.py와 동일 패턴: ``get_current_user``로 인증하고 현재 사용자 스코프로
동작한다(교차 테넌트 접근은 404 — ADR-0005). 응답은 camelCase.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, NoReturn

import anyio
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from core.database import get_async_session
from core.exceptions import AppError
from core.llm_call_context import bind_llm_call_context
from core.rate_limit import LLM_RATE_LIMIT, limiter
from domains.assist.tier_routing import get_fast_writing_client
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.dependency import require_budget_available
from domains.budget.service import estimate_tokens, record_usage
from domains.chat.ports import AbstractLLMPort
from domains.manuscript.models import Chapter, Episode, Synopsis
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import (
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    EpisodeCreate,
    EpisodeResponse,
    EpisodeUpdate,
    SynopsisContinueRequest,
    SynopsisResponse,
    SynopsisUpdate,
)
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.moderation.service import (
    PROVIDER_DECLINE_MESSAGE,
    stream_with_retry,
)
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.service import WorksService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/works/{work_id}", tags=["manuscript"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> ManuscriptService:
    return ManuscriptService(
        ManuscriptRepository(session),
        WorksService(WorksRepository(session)),
        MemoryService(MemoryRepository(session)),
    )


def _to_response(synopsis: Synopsis) -> SynopsisResponse:
    return SynopsisResponse(id=synopsis.id, work_id=synopsis.work_id, body=synopsis.body)


def _to_episode_response(episode: Episode) -> EpisodeResponse:
    return EpisodeResponse(
        id=episode.id,
        work_id=episode.work_id,
        title=episode.title,
        order_index=episode.order_index,
    )


def _to_chapter_response(chapter: Chapter) -> ChapterResponse:
    return ChapterResponse(
        id=chapter.id,
        work_id=chapter.work_id,
        episode_id=chapter.episode_id,
        title=chapter.title,
        order_index=chapter.order_index,
        global_seq=chapter.global_seq,
        body=chapter.body,
    )


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/synopsis", response_model=SynopsisResponse, summary="시놉시스 조회")
async def get_synopsis(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SynopsisResponse:
    try:
        synopsis = await service.get_synopsis(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(synopsis)


@router.put("/synopsis", response_model=SynopsisResponse, summary="시놉시스 upsert")
async def upsert_synopsis(
    work_id: uuid.UUID,
    payload: SynopsisUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SynopsisResponse:
    try:
        synopsis = await service.upsert_synopsis(work_id, current_user.id, payload.body)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(synopsis)


# ---------------------------------------------------------------------------
# 기획의도 AI 이어쓰기 (task #53) — 씬이 없는 작품 단위 요청이라 메모리 검색 없이
# 장르·서브장르·키워드·문체 + 클라이언트가 보낸 현재 텍스트만으로 조립한다.
# assist_router.py의 이어쓰기와 동일한 게이트 구성(budget→rate), 지연에 민감한 태스크용
# 빠른 티어(get_fast_writing_client) 재사용.
# ---------------------------------------------------------------------------


async def _get_works_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorksService:
    return WorksService(WorksRepository(session))


def _synopsis_continue_llm_client() -> AbstractLLMPort:
    return get_fast_writing_client()


async def _bind_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수(``core.rate_limit._get_user_key``)가 읽는
    ``request.state.user``를 인증된 사용자로 채운다(assist_router.py와 동일 패턴).
    """
    request.state.user = current_user


def _build_synopsis_continue_messages(work: Work, text: str) -> list[BaseMessage]:
    keywords = ", ".join(work.keywords) if work.keywords else "(없음)"
    system = (
        "당신은 웹소설 작가의 기획의도(왜 이 작품을 쓰는지, 어떤 메시지를 전달할지) 작성을 "
        f"보조하는 AI입니다. 이 작품의 장르는 '{work.genre}', 서브장르는 '{work.sub_genre}', "
        f"키워드는 [{keywords}], 문체는 '{work.style}'입니다. "
        "아래 지금까지 쓰인 기획의도 뒤에 자연스럽게 이어지는 문장을 생성하세요. "
        "기존 문장은 다시 쓰지 말고 이어지는 내용만 출력하세요."
    )
    return [SystemMessage(content=system), HumanMessage(content=text)]


async def _charge_sent(user_id: uuid.UUID, sent: list[str]) -> None:
    """지금까지 보낸 분량을 예산에 반영한다(완주·취소 양쪽에서 같은 조건을 쓴다)."""
    combined = "".join(sent)
    if combined and combined != PROVIDER_DECLINE_MESSAGE:
        await record_usage(user_id, estimate_tokens(combined))


async def _stream_synopsis_continue(
    llm: AbstractLLMPort, messages: list[Any], user_id: uuid.UUID
) -> Any:
    try:
        sent: list[str] = []
        async for chunk in stream_with_retry(llm, messages):
            sent.append(chunk)
            yield {"data": chunk}
        yield {"data": "[DONE]"}
        await _charge_sent(user_id, sent)
    except asyncio.CancelledError:
        # 취소 시 부분 차감. ``shield=True``가 없으면 이 await은 즉시 재취소돼 아무 일도
        # 일어나지 않는다 — 근거와 실측은 ``assist_router._stream_response`` 주석 참조.
        with anyio.CancelScope(shield=True):
            await _charge_sent(user_id, sent)
        raise
    except Exception as exc:
        logger.error("synopsis_continue_stream_error", error=str(exc), exc_info=True)
        yield {"event": "error", "data": str(exc)}


@router.post(
    "/synopsis/continue",
    summary="기획의도 AI 이어쓰기 (SSE)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def continue_synopsis(
    request: Request,
    work_id: uuid.UUID,
    payload: SynopsisContinueRequest,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    llm: AbstractLLMPort = Depends(_synopsis_continue_llm_client),
) -> EventSourceResponse:
    bind_llm_call_context(user_id=current_user.id, task="synopsis.continue")
    try:
        work = await works_service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)

    messages = _build_synopsis_continue_messages(work, payload.text)
    return EventSourceResponse(_stream_synopsis_continue(llm, messages, current_user.id))


# ---------------------------------------------------------------------------
# Episodes (부)
# ---------------------------------------------------------------------------


@router.get("/episodes", response_model=list[EpisodeResponse], summary="부 목록")
async def list_episodes(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[EpisodeResponse]:
    try:
        episodes = await service.list_episodes(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_episode_response(e) for e in episodes]


@router.post(
    "/episodes",
    response_model=EpisodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="부 생성",
)
async def create_episode(
    work_id: uuid.UUID,
    payload: EpisodeCreate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.create_episode(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.patch(
    "/episodes/reorder",
    response_model=list[EpisodeResponse],
    summary="부 순서 변경",
)
async def reorder_episodes(
    work_id: uuid.UUID,
    payload: list[uuid.UUID],
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[EpisodeResponse]:
    # 이 경로를 "/episodes/{episode_id}" PATCH보다 먼저 등록해야 한다 —
    # 그러지 않으면 "reorder"가 episode_id 자리로 매칭되어 422가 난다.
    try:
        episodes = await service.reorder_episodes(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return [_to_episode_response(e) for e in episodes]


@router.get("/episodes/{episode_id}", response_model=EpisodeResponse, summary="부 단건 조회")
async def get_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.get_episode(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.patch("/episodes/{episode_id}", response_model=EpisodeResponse, summary="부 수정")
async def update_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: EpisodeUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.update_episode(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.delete("/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT, summary="부 삭제")
async def delete_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> None:
    try:
        await service.delete_episode(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Chapters (챕터)
# ---------------------------------------------------------------------------


@router.get(
    "/episodes/{episode_id}/chapters", response_model=list[ChapterResponse], summary="챕터 목록"
)
async def list_chapters(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[ChapterResponse]:
    try:
        chapters = await service.list_chapters(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_chapter_response(c) for c in chapters]


@router.post(
    "/episodes/{episode_id}/chapters",
    response_model=ChapterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="챕터 생성",
)
async def create_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: ChapterCreate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.create_chapter(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.patch(
    "/episodes/{episode_id}/chapters/reorder",
    response_model=list[ChapterResponse],
    summary="챕터 순서 변경",
)
async def reorder_chapters(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: list[uuid.UUID],
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[ChapterResponse]:
    # "/chapters/{chapter_id}" PATCH보다 먼저 등록해야 한다(위 부 reorder와 동일 이유).
    try:
        chapters = await service.reorder_chapters(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return [_to_chapter_response(c) for c in chapters]


@router.get(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    response_model=ChapterResponse,
    summary="챕터 단건 조회",
)
async def get_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.get_chapter(work_id, current_user.id, episode_id, chapter_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.patch(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    response_model=ChapterResponse,
    summary="챕터 수정",
)
async def update_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    payload: ChapterUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.update_chapter(
            work_id, current_user.id, episode_id, chapter_id, payload
        )
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.delete(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="챕터 삭제",
)
async def delete_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> None:
    try:
        await service.delete_chapter(work_id, current_user.id, episode_id, chapter_id)
    except AppError as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Export (작품 전체 원고 zip 내보내기)
# ---------------------------------------------------------------------------


@router.get("/export", summary="작품 전체 원고 zip 내보내기")
async def export_manuscript(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> Response:
    try:
        zip_bytes = await service.export_manuscript_zip(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="novel.zip"'},
    )
