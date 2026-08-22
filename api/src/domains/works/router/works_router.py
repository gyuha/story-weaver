"""작품(Work) HTTP 라우터 — ``/api/v1/works``.

모든 엔드포인트는 ``get_current_user``로 인증되고 현재 사용자 스코프로 동작한다
(교차 테넌트 접근은 404 — ADR-0005). 응답은 프론트 목업 ``Work`` 계약(camelCase)에
맞춘 ``WorkResponse``로, 파생 필드(stats·reviewSummary·lastEditedLabel)를 계산해 채운다.
"""

from __future__ import annotations

import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
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
from domains.moderation.service import (
    PROVIDER_DECLINE_MESSAGE,
    invoke_with_retry,
)
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.schemas import (
    BeatSheetResponse,
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
        style_note=work.style_note,
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


# ---------------------------------------------------------------------------
# 비트 시트 생성 (plan.md v2-A S3) — HIGH_QUALITY 티어, assist_router.py/
# dynamic_update_router.py와 동일한 게이트 구성(precheck→budget→rate→완화 재시도).
# ---------------------------------------------------------------------------


def _beat_sheet_llm_client() -> AbstractLLMPort:
    return get_client_for_tier(Tier.high_quality)


async def _bind_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수(``core.rate_limit._get_user_key``)가 읽는
    ``request.state.user``를 인증된 사용자로 채운다(assist_router.py와 동일 패턴).
    """
    request.state.user = current_user


def _build_beat_sheet_messages(work: Work) -> list[BaseMessage]:
    keywords = ", ".join(work.keywords) if work.keywords else "(없음)"
    system = (
        "당신은 웹소설 비트 시트(회차별 전개 개요)를 설계하는 보조 AI입니다. "
        f"장르 '{work.genre}', 키워드 [{keywords}], 문체 '{work.style}'에 맞춰 "
        "1화부터 시작하는 회차별 비트를 한 줄씩 생성하세요. 각 줄은 "
        "'N화: 단계 — 설명' 형식으로 쓰고, 다른 설명 없이 줄 목록만 출력하세요."
    )
    if work.style_note:
        system += f" 작가가 지정한 문체 지침: {work.style_note}"
    return [SystemMessage(content=system), HumanMessage(content="비트 시트를 생성해줘.")]


def _parse_beats(raw_text: str) -> list[str]:
    return [line.strip() for line in raw_text.splitlines() if line.strip()]


@router.post(
    "/{work_id}/beat-sheet",
    response_model=BeatSheetResponse,
    summary="비트 시트 생성 (고품질 티어)",
    dependencies=[Depends(require_budget_available), Depends(_bind_rate_limit_user)],
)
@limiter.limit(LLM_RATE_LIMIT)
async def generate_beat_sheet(
    request: Request,
    response: Response,
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: WorksService = Depends(_get_service),
    llm: AbstractLLMPort = Depends(_beat_sheet_llm_client),
) -> BeatSheetResponse:
    bind_llm_call_context(user_id=current_user.id, task="works.beat_sheet")
    try:
        work = await service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)

    # S2 완화 재시도 — 거절/빈 응답이면 완화 프롬프트로 1회 재시도(moderation_service).
    outcome = await invoke_with_retry(llm, _build_beat_sheet_messages(work))
    if outcome.declined:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=PROVIDER_DECLINE_MESSAGE
        )

    raw_text = outcome.chunks[0]
    await record_usage(current_user.id, estimate_tokens(raw_text))
    return BeatSheetResponse(beats=_parse_beats(raw_text))
