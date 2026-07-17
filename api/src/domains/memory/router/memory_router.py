"""메모리 검색 HTTP 라우터 (plan.md S4).

``GET /api/v1/works/{work_id}/chapters/{chapter_id}/memory`` — timeline_router.py와
동일 패턴: ``get_current_user``로 인증하고, 교차 테넌트 접근은 404(ADR-0005).
``MemorySearchService``는 순환 임포트를 피하려고 서브모듈에서 직접 임포트한다
(memory_search_service.py 모듈 docstring 참조).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.schemas import MemoryItemResponse
from domains.memory.service import MemoryService
from domains.memory.service.memory_search_service import MemorySearchService
from domains.timeline.repository import TimelineRepository
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

router = APIRouter(prefix="/works/{work_id}/chapters/{chapter_id}/memory", tags=["memory"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> MemorySearchService:
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
    return MemorySearchService(
        MemoryRepository(session), worldbible_service, manuscript_service, timeline_service
    )


@router.get("", response_model=list[MemoryItemResponse], summary="현재 화의 메모리 검색")
async def search_memory(
    work_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: MemorySearchService = Depends(_get_service),
) -> list[MemoryItemResponse]:
    try:
        return await service.search(work_id, current_user.id, chapter_id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
