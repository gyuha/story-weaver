"""스트리밍 취소 회계 — 취소돼도 받은 분량이 예산에 잡히는지 (task #65).

세 스트리밍 경로(assist·작품 챗·기획의도 이어쓰기)가 같은 불변식을 갖는다.
한 파일에 나란히 두는 이유: 이건 세 도메인에 흩어진 **하나의** 교차 관심사이고,
한 곳만 고치고 나머지를 잊는 것이 이 작업의 가장 그럴듯한 사고다.

배경(착수 전 실측): 클라이언트가 SSE를 끊으면 제너레이터에 ``CancelledError``가
도달하는데, **그 핸들러 안의 ``await``은 즉시 재취소된다** — 감싸는 취소 스코프가
아직 취소 상태이기 때문이다. ``anyio.CancelScope(shield=True)`` 안에서만 완주한다.
그래서 각 테스트는 "취소 후에도 record_usage가 실제로 await됐다"를 단정한다.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from domains.assist.router.assist_router import _stream_response
from domains.budget.service import estimate_tokens
from domains.manuscript.router.manuscript_router import _stream_synopsis_continue
from domains.moderation.service import PROVIDER_DECLINE_MESSAGE

USER_ID = uuid.uuid4()


def _stalling_stream(chunks: list[str], started: asyncio.Event) -> Any:
    """``stream_with_retry`` 대역 — 청크를 흘린 뒤 멈춰서 취소될 틈을 만든다."""

    async def _impl(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        for chunk in chunks:
            yield chunk
        started.set()
        await asyncio.sleep(10)  # 이 사이에 소비 태스크가 취소된다
        yield "도달하지 않음"

    return _impl


async def _consume_then_cancel(agen: Any, started: asyncio.Event) -> None:
    """제너레이터를 소비하는 태스크를 만들고, 멈춘 지점에서 취소한다."""

    async def _consume() -> None:
        async for _ in agen:
            pass

    task = asyncio.get_running_loop().create_task(_consume())
    await started.wait()
    await asyncio.sleep(0)  # await asyncio.sleep(10)에 실제로 진입하게 한다
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


# ---------------------------------------------------------------------------
# assist 경로 — 편집기 이어쓰기 · 선택영역 액션 (운영 중 실제로 새고 있던 경로)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assist_stream_charges_partial_usage_on_cancel() -> None:
    started = asyncio.Event()
    with (
        patch(
            "domains.assist.router.assist_router.stream_with_retry",
            _stalling_stream(["가나", "다"], started),
        ),
        patch("domains.assist.router.assist_router.record_usage", new=AsyncMock()) as mock_record,
    ):
        await _consume_then_cancel(_stream_response(MagicMock(), [], USER_ID), started)

    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("가나다"))


@pytest.mark.asyncio
async def test_assist_stream_charges_once_on_normal_completion() -> None:
    """취소 처리 추가로 완주 경로가 이중 차감되지 않는지 고정한다."""

    async def _complete(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        yield "가"
        yield "나"

    with (
        patch("domains.assist.router.assist_router.stream_with_retry", _complete),
        patch("domains.assist.router.assist_router.record_usage", new=AsyncMock()) as mock_record,
    ):
        async for _ in _stream_response(MagicMock(), [], USER_ID):
            pass

    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("가나"))


@pytest.mark.asyncio
async def test_assist_stream_does_not_charge_provider_decline_on_cancel() -> None:
    """제공자 거절 문구만 받고 취소된 경우는 차감하지 않는다(완주 경로와 같은 조건)."""
    started = asyncio.Event()
    with (
        patch(
            "domains.assist.router.assist_router.stream_with_retry",
            _stalling_stream([PROVIDER_DECLINE_MESSAGE], started),
        ),
        patch("domains.assist.router.assist_router.record_usage", new=AsyncMock()) as mock_record,
    ):
        await _consume_then_cancel(_stream_response(MagicMock(), [], USER_ID), started)

    mock_record.assert_not_awaited()


# ---------------------------------------------------------------------------
# 기획의도 이어쓰기 경로
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_synopsis_stream_charges_partial_usage_on_cancel() -> None:
    started = asyncio.Event()
    with (
        patch(
            "domains.manuscript.router.manuscript_router.stream_with_retry",
            _stalling_stream(["기획", "의도"], started),
        ),
        patch(
            "domains.manuscript.router.manuscript_router.record_usage", new=AsyncMock()
        ) as mock_record,
    ):
        await _consume_then_cancel(_stream_synopsis_continue(MagicMock(), [], USER_ID), started)

    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("기획의도"))


@pytest.mark.asyncio
async def test_synopsis_stream_charges_once_on_normal_completion() -> None:
    async def _complete(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        yield "기획의도"

    with (
        patch("domains.manuscript.router.manuscript_router.stream_with_retry", _complete),
        patch(
            "domains.manuscript.router.manuscript_router.record_usage", new=AsyncMock()
        ) as mock_record,
    ):
        async for _ in _stream_synopsis_continue(MagicMock(), [], USER_ID):
            pass

    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("기획의도"))


# ---------------------------------------------------------------------------
# 작품 챗 경로 — 여기는 이미 finally 블록이라 구조가 다르다(run.md의 divergence 참조)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_work_chat_stream_charges_partial_usage_on_cancel() -> None:
    from domains.chat.router.chat_router import _stream_work_chat_response

    started = asyncio.Event()
    repo = MagicMock()
    repo.add_message = AsyncMock()
    session = MagicMock()
    session.commit = AsyncMock()
    conversation_id = uuid.uuid4()

    with (
        patch(
            "domains.chat.router.chat_router.stream_with_retry",
            _stalling_stream(["대", "화"], started),
        ),
        patch("domains.chat.router.chat_router.record_usage", new=AsyncMock()) as mock_record,
    ):
        await _consume_then_cancel(
            _stream_work_chat_response(MagicMock(), [], USER_ID, repo, conversation_id, session),
            started,
        )

    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("대화"))

    # task #66 — 잘린 메시지를 정상 종료로 거짓 기록하지 않는다.
    repo.add_message.assert_awaited_once_with(
        conversation_id, "assistant", "대화", finish_reason="cancelled"
    )


@pytest.mark.asyncio
async def test_work_chat_stream_records_stop_on_normal_completion() -> None:
    """완주 경로는 여전히 finish_reason='stop'이다 — 취소 구분이 완주를 오염시키지 않는지 (task #66)."""
    from domains.chat.router.chat_router import _stream_work_chat_response

    repo = MagicMock()
    repo.add_message = AsyncMock()
    session = MagicMock()
    session.commit = AsyncMock()
    conversation_id = uuid.uuid4()

    async def _complete(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        yield "대"
        yield "화"

    with (
        patch("domains.chat.router.chat_router.stream_with_retry", _complete),
        patch("domains.chat.router.chat_router.record_usage", new=AsyncMock()) as mock_record,
    ):
        async for _ in _stream_work_chat_response(
            MagicMock(), [], USER_ID, repo, conversation_id, session
        ):
            pass

    repo.add_message.assert_awaited_once_with(
        conversation_id, "assistant", "대화", finish_reason="stop"
    )
    mock_record.assert_awaited_once_with(USER_ID, estimate_tokens("대화"))
