"""Budget 게이트 — LLM 호출 직전 사용자 누적 사용량 상한 검사 (plan.md M4-S2).

assist·dynamic_update 라우터가 실제 LLM을 호출하기 전에 이 의존성을 라우트의
``dependencies=[Depends(...)]``로 걸어, S1(``get_usage``)이 반환하는 이번 주기
누적 사용량이 ``settings.budget_token_limit``에 도달했으면 비용이 드는 LLM 호출
자체를 막는다 — auth 도메인의 ``require_permission`` 게이트와 동일한 관례
(FastAPI 의존성이 직접 ``HTTPException``을 던져 시스템 500이 아닌 명확한 사용자
대면 안내로 응답한다).
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from core.config import get_settings
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.service import get_usage


async def require_budget_available(user: User = Depends(get_current_user)) -> None:
    """이번 주기 누적 사용량이 상한 이상이면 429로 차단한다."""
    usage = await get_usage(user.id)
    if usage >= get_settings().budget_token_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="이번 주기 사용량 한도 도달",
        )
