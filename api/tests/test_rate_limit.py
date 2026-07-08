"""``core.rate_limit`` 유닛 테스트 (TDD, plan.md M4-S3).

``_get_user_key``(구 ``main._get_user_key`` — S3에서 ``core/rate_limit.py``로 이동)와
429 예외 핸들러(``rate_limit_exceeded_handler``)가 실제로 main.py와 동일하게
등록됐을 때 raw slowapi 메시지 대신 앱 공통 포맷 + ``Retry-After`` 헤더를 반환하는지
확인한다.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Response
from httpx import ASGITransport, AsyncClient
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from core.rate_limit import _get_user_key, limiter, rate_limit_exceeded_handler


def test_get_user_key_prefers_authenticated_user() -> None:
    request = Request({"type": "http", "client": ("203.0.113.10", 1234), "headers": []})
    request.state.user = SimpleNamespace(id="user-123")

    assert _get_user_key(request) == "user:user-123"


def test_get_user_key_falls_back_to_remote_ip() -> None:
    request = Request({"type": "http", "client": ("203.0.113.10", 1234), "headers": []})

    assert _get_user_key(request) == "203.0.113.10"


@pytest.fixture
def app() -> FastAPI:
    """main.py와 동일한 방식으로 limiter를 등록한 최소 앱 + 토이 라우트."""
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)  # type: ignore[arg-type]

    @app.get("/ping")
    @limiter.limit("1/minute")
    async def ping(request: Request, response: Response) -> dict[str, bool]:
        return {"ok": True}

    return app


async def test_exceeding_the_limit_returns_429_with_wrapped_message_and_retry_after(
    app: FastAPI,
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/ping")
        second = await client.get("/ping")

    assert first.status_code == 200
    assert second.status_code == 429
    assert "Retry-After" in second.headers
    assert second.json() == {"detail": "Too many requests. Please wait a moment and try again."}
