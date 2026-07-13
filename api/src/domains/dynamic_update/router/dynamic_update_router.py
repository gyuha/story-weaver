"""동적 업데이트 추출·제안 API 라우터 (plan.md M3-S1/S2/S3).

``POST /api/v1/works/{work_id}/scenes/{scene_id}/extract-updates`` — assist_router.py와
동일 패턴(``get_current_user``로 인증, 교차 테넌트 접근은 404 — ADR-0005). LLM 호출은
LOW_COST 티어(assist 도메인의 ``tier_routing`` 재사용). 추출 직후 결과를 기존 엔티티와
매칭해 노이즈가 아닌 항목을 제안으로 저장한다(S2, ``SuggestionService.process_extraction``)
— 응답 자체는 S1과 동일한 원본 추출 결과다. 저장된 제안은
``GET .../update-suggestions``로 조회하고 ``.../update-suggestions/{id}/approve|reject``
로 반영/폐기한다(S3).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from core.llm_call_context import bind_llm_call_context
from core.rate_limit import LLM_RATE_LIMIT, limiter
from domains.assist.tier_routing import Tier, get_client_for_tier
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.dependency import require_budget_available
from domains.budget.service import estimate_tokens, record_usage
from domains.chat.ports import AbstractLLMPort
from domains.dynamic_update.models import UpdateSuggestion
from domains.dynamic_update.repository import DynamicUpdateRepository
from domains.dynamic_update.schemas import ExtractUpdatesResponse, UpdateSuggestionResponse
from domains.dynamic_update.service import DynamicUpdateService, SuggestionService
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

router = APIRouter(prefix="/works/{work_id}/scenes/{scene_id}", tags=["dynamic-update"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> DynamicUpdateService:
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
    return DynamicUpdateService(manuscript_service, worldbible_service, timeline_service)


async def _get_suggestion_service(
    session: AsyncSession = Depends(get_async_session),
) -> SuggestionService:
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
    return SuggestionService(
        DynamicUpdateRepository(session), works_service, worldbible_service, timeline_service
    )


def _extraction_llm_client() -> AbstractLLMPort:
    return get_client_for_tier(Tier.low_cost)


async def _bind_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수(``core.rate_limit._get_user_key``)가 읽는
    ``request.state.user``를 인증된 사용자로 채운다(plan.md M4-S3).
    """
    request.state.user = current_user


def _to_suggestion_response(suggestion: UpdateSuggestion) -> UpdateSuggestionResponse:
    return UpdateSuggestionResponse(
        id=suggestion.id,
        work_id=suggestion.work_id,
        scene_id=suggestion.scene_id,
        kind=suggestion.kind,
        payload=suggestion.payload,
        status=suggestion.status,
        created_at=suggestion.created_at,
    )


@router.post(
    "/extract-updates",
    response_model=ExtractUpdatesResponse,
    summary="씬 본문에서 신규 설정 후보 추출 + 제안 저장",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def extract_updates(
    request: Request,
    response: Response,
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: DynamicUpdateService = Depends(_get_service),
    suggestion_service: SuggestionService = Depends(_get_suggestion_service),
    llm: AbstractLLMPort = Depends(_extraction_llm_client),
) -> ExtractUpdatesResponse:
    bind_llm_call_context(user_id=current_user.id, task="dynamic_update.extract")
    try:
        result = await service.extract_updates(work_id, current_user.id, scene_id, llm)
        await suggestion_service.process_extraction(work_id, current_user.id, scene_id, result)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    # budget 도메인 사용량 기록(plan.md M4-S1) — invoke()의 usage_metadata는 프로바이더마다
    # 보장되지 않아(eco) 추출 결과 JSON 길이 기반 근사치(estimate_tokens)를 쓴다.
    await record_usage(current_user.id, estimate_tokens(result.model_dump_json()))
    return result


@router.get(
    "/update-suggestions",
    response_model=list[UpdateSuggestionResponse],
    summary="업데이트 제안 목록",
)
async def list_update_suggestions(
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    suggestion_service: SuggestionService = Depends(_get_suggestion_service),
) -> list[UpdateSuggestionResponse]:
    try:
        suggestions = await suggestion_service.list_suggestions(work_id, current_user.id, scene_id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return [_to_suggestion_response(s) for s in suggestions]


@router.post(
    "/update-suggestions/{suggestion_id}/approve",
    response_model=UpdateSuggestionResponse,
    summary="업데이트 제안 승인 — 엔티티/타임라인 상태에 반영",
)
async def approve_update_suggestion(
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    suggestion_service: SuggestionService = Depends(_get_suggestion_service),
) -> UpdateSuggestionResponse:
    try:
        suggestion = await suggestion_service.approve_suggestion(
            work_id, current_user.id, suggestion_id
        )
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _to_suggestion_response(suggestion)


@router.post(
    "/update-suggestions/{suggestion_id}/reject",
    response_model=UpdateSuggestionResponse,
    summary="업데이트 제안 거절 — 데이터 변경 없음",
)
async def reject_update_suggestion(
    work_id: uuid.UUID,
    scene_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    suggestion_service: SuggestionService = Depends(_get_suggestion_service),
) -> UpdateSuggestionResponse:
    try:
        suggestion = await suggestion_service.reject_suggestion(
            work_id, current_user.id, suggestion_id
        )
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _to_suggestion_response(suggestion)
