"""작품(Work) HTTP 라우터 — ``/api/v1/works``.

모든 엔드포인트는 ``get_current_user``로 인증되고 현재 사용자 스코프로 동작한다
(교차 테넌트 접근은 404 — ADR-0005). 응답은 프론트 목업 ``Work`` 계약(camelCase)에
맞춘 ``WorkResponse``로, 파생 필드(stats·reviewSummary·lastEditedLabel)를 계산해 채운다.
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
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.schemas import (
    ReviewSummary,
    WorkCreate,
    WorkResponse,
    WorkStats,
    WorkUpdate,
)
from domains.works.service import WorksService

router = APIRouter(prefix="/works", tags=["works"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorksService:
    return WorksService(WorksRepository(session))


def _to_response(work: Work) -> WorkResponse:
    """Work 모델 → 응답. stats·reviewSummary는 하위 도메인 부재로 0, lastEditedLabel은 파생."""
    last_edited = f"{work.updated_at:%Y-%m-%d} 수정" if work.updated_at else "방금"
    return WorkResponse(
        id=work.id,
        title=work.title,
        short_label=work.short_label,
        genre=work.genre,
        sub_genre=work.sub_genre,
        keywords=list(work.keywords),
        style=work.style,
        status=work.status,
        cover_theme=work.cover_theme,
        last_edited_label=last_edited,
        stats=WorkStats(),
        review_summary=ReviewSummary(),
    )


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("", response_model=list[WorkResponse], summary="내 작품 목록")
async def list_works(
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
) -> list[WorkResponse]:
    works = await service.list_works(current_user.id)
    return [_to_response(w) for w in works]


@router.post(
    "",
    response_model=WorkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="작품 생성",
)
async def create_work(
    payload: WorkCreate,
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
) -> WorkResponse:
    work = await service.create_work(current_user.id, payload)
    return _to_response(work)


@router.get("/{work_id}", response_model=WorkResponse, summary="작품 단건 조회")
async def get_work(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
) -> WorkResponse:
    try:
        work = await service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(work)


@router.patch("/{work_id}", response_model=WorkResponse, summary="작품 수정")
async def update_work(
    work_id: uuid.UUID,
    payload: WorkUpdate,
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
) -> WorkResponse:
    try:
        work = await service.update_work(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(work)


@router.delete("/{work_id}", status_code=status.HTTP_204_NO_CONTENT, summary="작품 삭제")
async def delete_work(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
) -> None:
    try:
        await service.delete_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
