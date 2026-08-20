"""이미지 생성·비전 역번역 호출의 llm_calls 기록 테스트 (plan.md S4, ADR-0009).

이미지 생성은 ``ChatLiteLLM``을 타지 않아 자동 로깅이 붙지 않으므로, 각 어댑터가
``save_llm_call_log``를 직접 호출했는지를 실 DB로 단정한다("불렸다"만 확인하는
목은 이 함정을 가리므로 쓰지 않는다 — plan.md 회고 참고).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest
from sqlalchemy import delete, select

from core.database import AsyncSessionFactory, engine
from domains.chat.models import LLMCallLog
from domains.image_generation.service.image_gateway import _MODELS, generate_image
from domains.image_generation.service.vision_describe import _VISION_MODELS, describe_image

pytestmark = pytest.mark.unit

_B64_JPEG = "//5mYWtl"  # 디코드 성공 여부는 여기서 무관, 아무 base64 문자열


@pytest.fixture(autouse=True)
async def _clean_llm_call_logs() -> AsyncIterator[None]:
    async with AsyncSessionFactory() as session:
        await session.execute(delete(LLMCallLog))
        await session.commit()
    yield
    async with AsyncSessionFactory() as session:
        await session.execute(delete(LLMCallLog))
        await session.commit()
    await engine.dispose()


def _capture_create_task() -> tuple[list[Any], Any]:
    """``asyncio.create_task``를 가로채 스케줄 대신 캡처한다(결정적으로 await하기 위함).

    ``tests/chat/test_llm_client.py``의 동일 패턴.
    """
    captured: list[Any] = []

    def _fake_create_task(coro: Any) -> MagicMock:
        captured.append(coro)
        return MagicMock()

    return captured, _fake_create_task


async def _row_for_task(task: str) -> LLMCallLog:
    async with AsyncSessionFactory() as session:
        result = await session.execute(select(LLMCallLog).where(LLMCallLog.task == task))
        return result.scalar_one()


async def _rows_for_task(task: str) -> list[LLMCallLog]:
    """같은 task의 행을 기록 순서대로 모두 읽는다.

    ``generate_image``는 모델 폴백을 하므로 **실패 시 시도한 모델 수만큼 행이 남는다** —
    ``scalar_one()``으로는 읽을 수 없고, 모델별로 남는지가 폴백의 실제 계약이다.
    """
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(LLMCallLog).where(LLMCallLog.task == task).order_by(LLMCallLog.created_at)
        )
        return list(result.scalars())


async def test_generate_image_logs_successful_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"b64_json": _B64_JPEG}]})

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def _fake_async_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", _fake_async_client)

    captured, fake_create_task = _capture_create_task()
    with patch(
        "domains.image_generation.service.image_gateway.asyncio.create_task",
        side_effect=fake_create_task,
    ):
        await generate_image("프롬프트")
        assert len(captured) == 1

    # patch 밖에서 await한다 — patch가 걸린 동안엔 asyncio.create_task 자체가 전역으로
    # 가짜로 바뀌어(모듈이 실제 asyncio 모듈을 공유하므로) 이 코루틴 내부에서 SQLAlchemy
    # AsyncSession.__aexit__이 부르는 create_task까지 가로채 세션 close가 스케줄되지
    # 않는다("coroutine was never awaited" 경고의 원인).
    await captured[0]

    row = await _row_for_task("image_generation")
    assert row.model == "antigravity/gemini-3.1-flash-image"
    assert row.latency_ms >= 0
    assert row.messages == [{"role": "user", "content": "프롬프트"}]
    assert row.response is None
    assert row.error is None


async def test_generate_image_logs_failed_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "boom"}})

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def _fake_async_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", _fake_async_client)

    captured, fake_create_task = _capture_create_task()
    with (
        patch(
            "domains.image_generation.service.image_gateway.asyncio.create_task",
            side_effect=fake_create_task,
        ),
        pytest.raises(Exception, match="boom"),
    ):
        await generate_image("프롬프트")

    # 폴백: 모델마다 한 번씩 시도했으므로 로그도 그 수만큼 예약된다.
    assert len(captured) == len(_MODELS)
    for coro in captured:  # patch 밖에서 await (위 성공 테스트와 동일한 이유)
        await coro

    rows = await _rows_for_task("image_generation")
    assert [r.model for r in rows] == list(_MODELS), "각 시도가 자기 모델 이름으로 남아야 한다"
    for row in rows:
        assert row.error is not None
        assert "boom" in row.error


async def test_generate_image_logs_timeout_with_nonempty_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """타임아웃도 ``error``에 **읽을 수 있는 값**을 남겨야 한다.

    ``str(httpx.ReadTimeout(""))``은 빈 문자열이라, 그대로 기록하면 이 컬럼이 비어
    "실패했다는 사실만 남고 무엇이 실패했는지는 사라진" 상태가 된다 — 실제로 그 때문에
    120초짜리 실패 4건의 원인을 로그만으로는 알 수 없었다.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("")

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def _fake_async_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", _fake_async_client)

    captured, fake_create_task = _capture_create_task()
    with (
        patch(
            "domains.image_generation.service.image_gateway.asyncio.create_task",
            side_effect=fake_create_task,
        ),
        pytest.raises(Exception),
    ):
        await generate_image("프롬프트")

    assert len(captured) == len(_MODELS)
    for coro in captured:
        await coro

    rows = await _rows_for_task("image_generation")
    assert [r.model for r in rows] == list(_MODELS)
    for row in rows:
        assert row.error, "타임아웃의 error가 비면 로그로 원인을 추적할 수 없다"
        assert "Timeout" in row.error or "타임아웃" in row.error


async def test_describe_image_logs_successful_call() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "은발에 붉은 눈동자"}}]}
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://gw/v1")

    captured, fake_create_task = _capture_create_task()
    with patch(
        "domains.image_generation.service.vision_describe.asyncio.create_task",
        side_effect=fake_create_task,
    ):
        await describe_image(b"fake-bytes", client=client)
        assert len(captured) == 1

    await captured[0]  # patch 밖에서 await (위 generate_image 테스트와 동일한 이유)

    row = await _row_for_task("image_description")
    assert row.model == "antigravity/gemini-2.5-flash"  # 체인의 첫 모델
    assert row.latency_ms >= 0
    assert row.messages[0]["role"] == "user"
    assert row.response is None
    assert row.error is None


async def test_describe_image_logs_failed_call() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal error")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://gw/v1")

    captured, fake_create_task = _capture_create_task()
    with (
        patch(
            "domains.image_generation.service.vision_describe.asyncio.create_task",
            side_effect=fake_create_task,
        ),
        pytest.raises(Exception),
    ):
        await describe_image(b"fake-bytes", client=client)

    # 비전도 모델 폴백을 하므로 시도한 수만큼 로그가 예약된다.
    assert len(captured) == len(_VISION_MODELS)
    for coro in captured:
        await coro

    rows = await _rows_for_task("image_description")
    assert [r.model for r in rows] == list(_VISION_MODELS)
    for row in rows:
        assert row.error is not None
