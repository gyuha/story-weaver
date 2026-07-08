"""캐릭터 관계도 HTTP 라우터 — ``/api/v1/works/{work_id}/relationships`` (v2-C).

conflicts_router.py와 동일 패턴: ``get_current_user``로 인증하고, 교차 테넌트 접근은
404(ADR-0005). 응답은 camelCase. ``up_to_scene_id`` 쿼리 파라미터를 주면(S2) 그
시점까지의 ``relation_to_*`` 타임라인 상태를 엣지에 반영하고 LOW_COST 티어 LLM으로
관계 요약을 함께 생성한다(``summary`` — 반영할 사실이 없으면 null, LLM 호출도 생략).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from core.rate_limit import LLM_RATE_LIMIT, limiter
from domains.assist.tier_routing import Tier, get_client_for_tier
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.dependency import require_budget_available
from domains.chat.ports import AbstractLLMPort
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.relationships.schemas import RelationshipGraphResponse
from domains.relationships.service import RelationshipsService
from domains.timeline.repository import TimelineRepository
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

router = APIRouter(prefix="/works/{work_id}/relationships", tags=["relationships"])


async def _bind_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수(``core.rate_limit._get_user_key``)가 읽는
    ``request.state.user``를 인증된 사용자로 채운다(assist_router.py와 동일 패턴).
    """
    request.state.user = current_user


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> RelationshipsService:
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
    return RelationshipsService(
        works_service, worldbible_service, timeline_service, manuscript_service
    )


def _relationships_llm_client() -> AbstractLLMPort:
    return get_client_for_tier(Tier.low_cost)


@router.get(
    "",
    response_model=RelationshipGraphResponse,
    summary="캐릭터 관계도",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def get_relationships(
    request: Request,
    response: Response,
    work_id: uuid.UUID,
    up_to_scene_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    service: RelationshipsService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_relationships_llm_client),
) -> RelationshipGraphResponse:
    try:
        edges, summary = await service.get_relationships(
            work_id, current_user.id, up_to_scene_id, llm
        )
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return RelationshipGraphResponse(edges=edges, summary=summary)
