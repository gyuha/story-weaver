"""설정 충돌 HTTP 라우터 (data-model.md 8장, plan.md v2-B S2).

``GET /api/v1/works/{work_id}/conflicts`` — memory_router.py/timeline_router.py와 동일
패턴: ``get_current_user``로 인증하고, 교차 테넌트 접근은 404(ADR-0005). 응답은
camelCase.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.conflicts.schemas import ConflictResponse
from domains.conflicts.service import ConflictsService
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.timeline.repository import TimelineRepository
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

router = APIRouter(prefix="/works/{work_id}/conflicts", tags=["conflicts"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> ConflictsService:
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
    return ConflictsService(works_service, worldbible_service, timeline_service, manuscript_service)


@router.get("", response_model=list[ConflictResponse], summary="설정 충돌 목록")
async def list_conflicts(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ConflictsService = Depends(_get_service),
) -> list[ConflictResponse]:
    try:
        return await service.list_conflicts(work_id, current_user.id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
