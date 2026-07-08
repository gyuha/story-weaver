"""엔티티 카드(World Bible) HTTP 라우터 — ``/api/v1/works/{work_id}/entities``.

works_router.py/manuscript_router.py와 동일 패턴: ``get_current_user``로 인증하고
현재 사용자 스코프로 동작한다(교차 테넌트 접근은 404 — ADR-0005). 응답은 camelCase.
"""

from __future__ import annotations

import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.models import Entity
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.schemas import EntityCreate, EntityResponse, EntityUpdate
from domains.worldbible.service import WorldBibleService

router = APIRouter(prefix="/works/{work_id}/entities", tags=["worldbible"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorldBibleService:
    return WorldBibleService(
        WorldBibleRepository(session),
        WorksService(WorksRepository(session)),
        MemoryService(MemoryRepository(session)),
    )


def _to_response(entity: Entity) -> EntityResponse:
    return EntityResponse(
        id=entity.id,
        work_id=entity.work_id,
        entity_type=entity.entity_type,
        name=entity.name,
        aliases=entity.aliases,
        summary=entity.summary,
        attributes=entity.attributes,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("", response_model=list[EntityResponse], summary="엔티티 카드 목록")
async def list_entities(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorldBibleService = Depends(_get_service),
) -> list[EntityResponse]:
    try:
        entities = await service.list_entities(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_response(e) for e in entities]


@router.post(
    "",
    response_model=EntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="엔티티 카드 생성",
)
async def create_entity(
    work_id: uuid.UUID,
    payload: EntityCreate,
    current_user: User = Depends(get_current_user),
    service: WorldBibleService = Depends(_get_service),
) -> EntityResponse:
    try:
        entity = await service.create_entity(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(entity)


@router.get("/{entity_id}", response_model=EntityResponse, summary="엔티티 카드 단건 조회")
async def get_entity(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorldBibleService = Depends(_get_service),
) -> EntityResponse:
    try:
        entity = await service.get_entity(work_id, current_user.id, entity_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(entity)


@router.patch("/{entity_id}", response_model=EntityResponse, summary="엔티티 카드 수정")
async def update_entity(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    payload: EntityUpdate,
    current_user: User = Depends(get_current_user),
    service: WorldBibleService = Depends(_get_service),
) -> EntityResponse:
    try:
        entity = await service.update_entity(work_id, current_user.id, entity_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(entity)


@router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT, summary="엔티티 카드 삭제")
async def delete_entity(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorldBibleService = Depends(_get_service),
) -> None:
    try:
        await service.delete_entity(work_id, current_user.id, entity_id)
    except AppError as exc:
        _raise_http(exc)
