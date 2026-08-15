"""비전 역번역 어댑터 테스트 (S3, TDD). 실 네트워크 없이 HTTP 목으로 고정한다."""

from __future__ import annotations

import base64
import json
from collections.abc import Callable

import httpx
import pytest

from core.exceptions import AppError
from domains.image_generation.service.vision_describe import describe_image

pytestmark = pytest.mark.unit

_IMAGE_BYTES = b"fake-jpeg-bytes"


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://gateway/v1")


def _ok_handler(request: httpx.Request) -> httpx.Response:
    """게이트웨이 실측: ``stream`` 이 명시적으로 false가 아니면 SSE로 응답한다."""
    body = json.loads(request.content)
    if body.get("stream") is not False:
        return httpx.Response(200, text='data: {"choices":[]}\n\ndata: [DONE]\n\n')
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": "은발에 붉은 눈동자, 흑색 장포"}}]},
    )


async def test_describe_image_sends_stream_false_and_data_uri() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return _ok_handler(request)

    result = await describe_image(_IMAGE_BYTES, client=_client(handler))

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["stream"] is False
    expected_uri = f"data:image/jpeg;base64,{base64.b64encode(_IMAGE_BYTES).decode('ascii')}"
    image_parts = [
        part
        for message in body["messages"]
        for part in message["content"]
        if part.get("type") == "image_url"
    ]
    assert image_parts == [{"type": "image_url", "image_url": {"url": expected_uri}}]
    assert result == "은발에 붉은 눈동자, 흑색 장포"


async def test_describe_image_returns_content_string() -> None:
    result = await describe_image(_IMAGE_BYTES, client=_client(_ok_handler))
    assert result == "은발에 붉은 눈동자, 흑색 장포"


async def test_describe_image_missing_content_raises_app_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {}}]})

    with pytest.raises(AppError):
        await describe_image(_IMAGE_BYTES, client=_client(handler))


async def test_describe_image_empty_content_raises_app_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "  "}}]})

    with pytest.raises(AppError):
        await describe_image(_IMAGE_BYTES, client=_client(handler))


async def test_describe_image_non_200_raises_app_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal error")

    with pytest.raises(AppError):
        await describe_image(_IMAGE_BYTES, client=_client(handler))


async def test_describe_image_non_json_response_raises_app_error() -> None:
    """stream: false 를 안 보내면 게이트웨이가 SSE로 응답해 json.loads가 깨진다(실측)."""

    def handler(request: httpx.Request) -> httpx.Response:
        # stream 미지정을 흉내내려면 요청 body를 무시하고 무조건 SSE로 응답한다.
        return httpx.Response(200, text='data: {"choices":[]}\n\n')

    with pytest.raises(AppError):
        await describe_image(_IMAGE_BYTES, client=_client(handler))
