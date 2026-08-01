"""``anyio.CancelScope(shield=True)``가 실제로 방어하고 있는지 실스택으로 고정 (task #65).

**단위 테스트로는 이 불변식을 잡을 수 없다.** 평범한 ``task.cancel()``은 취소를 한 번만
전달하므로 핸들러 안의 후속 ``await``이 그냥 성공한다 → shield를 지워도 단위 테스트는
green이다(실측 확인). 실제 운영 경로는 sse-starlette가 **anyio 태스크그룹 스코프**를
취소하는 형태이고, 그 스코프는 취소 상태가 유지돼 후속 ``await``을 즉시 재취소한다.

그래서 이 테스트는 실제 uvicorn + 실제 ``EventSourceResponse`` + 실제 클라이언트 끊김으로
운영 경로를 재현하고, **운영 코드인** ``assist_router._stream_response``를 그대로 태운다.
shield를 제거하면 이 테스트는 red가 된다(구현 시 직접 제거해 확인했다).
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from sse_starlette.sse import EventSourceResponse

from domains.assist.router.assist_router import _stream_response

_PORT = 8933
USER_ID = uuid.uuid4()


async def _slow_provider(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
    """청크를 천천히 내보내, 클라이언트가 중간에 끊을 틈을 만든다."""
    for i in range(50):
        await asyncio.sleep(0.05)
        yield f"청크{i}"


@pytest.mark.asyncio
async def test_shield_lets_budget_charge_finish_after_real_client_disconnect() -> None:
    charged: list[int] = []

    async def _fake_record_usage(_user_id: uuid.UUID, tokens: int) -> int:
        await asyncio.sleep(0.01)  # await 경계가 있어야 재취소 여부가 드러난다
        charged.append(tokens)
        return tokens

    app = FastAPI()

    @app.post("/probe")
    async def probe() -> EventSourceResponse:
        return EventSourceResponse(_stream_response(MagicMock(), [], USER_ID))

    with (
        patch("domains.assist.router.assist_router.stream_with_retry", _slow_provider),
        patch(
            "domains.assist.router.assist_router.record_usage",
            new=AsyncMock(side_effect=_fake_record_usage),
        ),
    ):
        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=_PORT, log_level="error")
        )
        serve_task = asyncio.get_running_loop().create_task(server.serve())
        try:
            while not server.started:
                await asyncio.sleep(0.05)

            # 프론트의 AbortController와 같은 효과 — 몇 줄만 받고 소켓을 닫는다.
            received = 0
            async with (
                httpx.AsyncClient(timeout=10) as client,
                client.stream("POST", f"http://127.0.0.1:{_PORT}/probe") as res,
            ):
                async for _ in res.aiter_lines():
                    received += 1
                    if received >= 4:
                        break

            await asyncio.sleep(2.0)  # 서버 쪽 취소 처리가 끝날 시간
        finally:
            server.should_exit = True
            with contextlib.suppress(asyncio.CancelledError):
                await serve_task

    assert received >= 4, "청크를 받기 전에 끊겼다면 취소 경로를 시험하지 못한다"
    assert charged, (
        "취소 후 예산 차감이 완주하지 못했다 — anyio.CancelScope(shield=True)가 "
        "없거나 동작하지 않는다. 이 실패는 '조용히 안 걷힌다'는 운영 버그를 뜻한다."
    )
    assert charged[0] > 0


@pytest.mark.asyncio
async def test_work_chat_records_cancelled_finish_reason_after_real_disconnect() -> None:
    """운영 코드가 실제 취소에서 ``finish_reason='cancelled'``를 남기는지 (task #66).

    단위 테스트로는 부족하다 — 평범한 ``task.cancel()``은 anyio 스코프의 재취소를
    재현하지 못하므로, 플래그가 세워지지 않아 ``'stop'``으로 거짓 기록되는 실패를
    통과시킨다. 그래서 **운영 제너레이터** ``_stream_work_chat_response``를 실제
    uvicorn + ``EventSourceResponse`` + 실제 클라이언트 끊김으로 태운다.
    """
    from domains.chat.router.chat_router import _stream_work_chat_response

    saved: list[dict[str, object]] = []

    async def _fake_add_message(
        _conversation_id: uuid.UUID, role: str, content: str, *, finish_reason: str
    ) -> None:
        await asyncio.sleep(0.01)  # await 경계가 있어야 재취소 여부가 드러난다
        saved.append({"role": role, "content": content, "finish_reason": finish_reason})

    repo = MagicMock()
    repo.add_message = AsyncMock(side_effect=_fake_add_message)
    session = MagicMock()
    session.commit = AsyncMock()

    app = FastAPI()

    @app.post("/probe")
    async def probe() -> EventSourceResponse:
        return EventSourceResponse(
            _stream_work_chat_response(MagicMock(), [], USER_ID, repo, uuid.uuid4(), session)
        )

    with (
        patch("domains.chat.router.chat_router.stream_with_retry", _slow_provider),
        patch("domains.chat.router.chat_router.record_usage", new=AsyncMock()),
    ):
        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=_PORT + 1, log_level="error")
        )
        serve_task = asyncio.get_running_loop().create_task(server.serve())
        try:
            while not server.started:
                await asyncio.sleep(0.05)

            received = 0
            async with (
                httpx.AsyncClient(timeout=10) as client,
                client.stream("POST", f"http://127.0.0.1:{_PORT + 1}/probe") as res,
            ):
                async for _ in res.aiter_lines():
                    received += 1
                    if received >= 4:
                        break

            await asyncio.sleep(2.0)
        finally:
            server.should_exit = True
            with contextlib.suppress(asyncio.CancelledError):
                await serve_task

    assert received >= 4, "청크를 받기 전에 끊겼다면 취소 경로를 시험하지 못한다"
    assert saved, "취소 후 메시지 저장이 완주하지 못했다 — shield가 동작하지 않는다"
    assert saved[0]["finish_reason"] == "cancelled", (
        "잘린 메시지가 정상 종료로 거짓 기록됐다 — except asyncio.CancelledError의 "
        "플래그가 실제 취소 경로에서 세워지지 않는다는 뜻이다."
    )
    assert str(saved[0]["content"])
