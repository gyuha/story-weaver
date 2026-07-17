"""Per-user request rate limiter (``slowapi``), shared by domain routers (plan.md M4-S3).

``main.py`` wires ``limiter``'s ``app.state`` and exception handler; domain routers
import ``limiter``/``LLM_RATE_LIMIT`` directly to decorate individual routes with
``@limiter.limit(LLM_RATE_LIMIT)``.

``_get_user_key`` rate-limits per authenticated user (falls back to remote IP for
unauthenticated requests), which only works if something sets ``request.state.user``
before the check runs — each decorated route adds a small ``Depends`` for that (see
``domains.assist.router.assist_router._bind_rate_limit_user``).

``key_style="endpoint"`` is required here: these routes are parameterized by
``work_id``/``chapter_id``, and slowapi's default ``key_style="url"`` would bucket by
the literal resolved path — so the same user hitting different chapters would never
accumulate toward the same limit. Bucketing by endpoint function name instead limits
per (user, action type), which is what "사용자별 요청 rate 상한" means.

Storage is in-memory (slowapi's default) — fine for the current single-worker
deployment (``core/config.py``'s ``workers: int = 1``). If this ever runs with
multiple workers, pass ``storage_uri=settings.redis_dsn`` so counters are shared
across processes (not done here to avoid adding blocking Redis I/O to the request
path without being asked).
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import Response


def _get_user_key(request: Request) -> str:
    """Rate-limit key: use authenticated user ID if available, else remote IP."""
    user = getattr(request.state, "user", None)
    if user is not None and hasattr(user, "id"):
        return f"user:{user.id}"
    return get_remote_address(request)


#: Shared Limiter instance — routers import this to apply per-route limits.
#: headers_enabled=True adds the standard Retry-After header on 429s.
limiter = Limiter(key_func=_get_user_key, headers_enabled=True, key_style="endpoint")

#: eco: 요금제별 정확한 한도는 미결정(PRD 4.1) — LLM 호출 라우트 공통 placeholder.
LLM_RATE_LIMIT = "10/minute"


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
    """429 응답을 앱 공통 ``{"detail": ...}`` 포맷 + 사용자 대면 문구로 감싼다.

    slowapi 기본 핸들러는 ``{"error": "Rate limit exceeded: 10 per 1 minute"}``처럼
    내부 rate-limit 문법을 그대로 노출한다 — 본문만 바꾸고 ``Retry-After`` 헤더는
    slowapi의 기존 로직(``_inject_headers``)으로 그대로 채운다.
    """
    assert isinstance(exc, RateLimitExceeded)
    response = JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please wait a moment and try again."},
    )
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    return limiter._inject_headers(response, view_rate_limit)  # type: ignore[arg-type]
