"""타임라인 상태·씬-엔티티 링크 HTTP 라우터.

``router``는 ``/api/v1/works/{work_id}/entities/{entity_id}/timeline-states``,
``links_router``는 ``/api/v1/works/{work_id}/chapters/{chapter_id}/links`` — 경로 파라미터
(entity_id vs chapter_id)가 달라 하나의 ``APIRouter``에 같은 prefix로 묶을 수 없어 별도
라우터 인스턴스로 둔다. 둘 다 같은 ``TimelineService``/``_get_service`` 의존성을
공유한다. worldbible_router.py/manuscript_router.py와 동일 패턴: ``get_current_user``로
인증하고 현재 사용자 스코프로 동작한다(교차 테넌트 접근은 404 — ADR-0005). 응답은
camelCase. ``up_to_chapter_id`` 쿼리 파라미터로 시점 필터(스포일러 방지)를 적용한다.
"""

from __future__ import annotations

import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.timeline.models import SceneEntityLink, TimelineState
from domains.timeline.repository import TimelineRepository
from domains.timeline.schemas import (
    SceneEntityLinkCreate,
    SceneEntityLinkResponse,
    TimelineStateCreate,
    TimelineStateResponse,
)
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

router = APIRouter(
    prefix="/works/{work_id}/entities/{entity_id}/timeline-states", tags=["timeline"]
)
links_router = APIRouter(prefix="/works/{work_id}/chapters/{chapter_id}/links", tags=["timeline"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> TimelineService:
    works_service = WorksService(WorksRepository(session))
    memory_service = MemoryService(MemoryRepository(session))
    return TimelineService(
        TimelineRepository(session),
        WorldBibleService(WorldBibleRepository(session), works_service, memory_service),
        ManuscriptService(ManuscriptRepository(session), works_service, memory_service),
    )


def _to_response(state: TimelineState) -> TimelineStateResponse:
    return TimelineStateResponse(
        id=state.id,
        work_id=state.work_id,
        entity_id=state.entity_id,
        chapter_id=state.chapter_id,
        state_key=state.state_key,
        state_value=state.state_value,
        note=state.note,
        source=state.source,
        created_at=state.created_at,
    )


def _to_link_response(link: SceneEntityLink) -> SceneEntityLinkResponse:
    return SceneEntityLinkResponse(
        id=link.id,
        work_id=link.work_id,
        chapter_id=link.chapter_id,
        entity_id=link.entity_id,
        source=link.source,
        created_at=link.created_at,
    )


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "",
    response_model=TimelineStateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="타임라인 상태 생성",
)
async def create_timeline_state(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    payload: TimelineStateCreate,
    current_user: User = Depends(get_current_user),
    service: TimelineService = Depends(_get_service),
) -> TimelineStateResponse:
    try:
        state = await service.create_timeline_state(work_id, current_user.id, entity_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(state)


@router.get("", response_model=list[TimelineStateResponse], summary="타임라인 상태 목록")
async def list_timeline_states(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    up_to_chapter_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    service: TimelineService = Depends(_get_service),
) -> list[TimelineStateResponse]:
    try:
        states = await service.list_timeline_states(
            work_id, current_user.id, entity_id, up_to_chapter_id
        )
    except AppError as exc:
        _raise_http(exc)
    return [_to_response(s) for s in states]


# ---------------------------------------------------------------------------
# Scene-Entity Links (씬-엔티티 링크)
# ---------------------------------------------------------------------------


@links_router.get("", response_model=list[SceneEntityLinkResponse], summary="씬-엔티티 링크 목록")
async def list_links(
    work_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: TimelineService = Depends(_get_service),
) -> list[SceneEntityLinkResponse]:
    try:
        links = await service.list_links(work_id, current_user.id, chapter_id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_link_response(link) for link in links]


@links_router.post(
    "",
    response_model=SceneEntityLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="씬-엔티티 링크 생성(중복 시 기존 링크 반환)",
)
async def create_link(
    work_id: uuid.UUID,
    chapter_id: uuid.UUID,
    payload: SceneEntityLinkCreate,
    current_user: User = Depends(get_current_user),
    service: TimelineService = Depends(_get_service),
) -> SceneEntityLinkResponse:
    try:
        link = await service.create_link(work_id, current_user.id, chapter_id, payload.entity_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_link_response(link)


@links_router.delete(
    "/{entity_id}", status_code=status.HTTP_204_NO_CONTENT, summary="씬-엔티티 링크 삭제"
)
async def delete_link(
    work_id: uuid.UUID,
    chapter_id: uuid.UUID,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: TimelineService = Depends(_get_service),
) -> None:
    try:
        await service.delete_link(work_id, current_user.id, chapter_id, entity_id)
    except AppError as exc:
        _raise_http(exc)
