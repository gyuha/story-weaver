"""비전 역번역 어댑터 테스트 (S3, TDD). 실 네트워크 없이 HTTP 목으로 고정한다."""

from __future__ import annotations

import base64
import json
from collections.abc import Callable

import httpx
import pytest

from core.exceptions import AppError
from domains.image_generation.service.vision_describe import _VISION_MODELS, describe_image

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


# ---------------------------------------------------------------------------
# 모델 폴백 — `auto/*` 별칭이 비전을 못 보는 모델로 라우팅되는 사고를 막는다
#
# 실측(2026-08-20): 게이트웨이의 `auto/best-vision` · `auto/pro-vision` ·
# `auto/multimodal` 세 별칭이 **전부** `openai/gpt-oss-120b`로 라우팅되고, 그 모델은
# "죄송하지만 현재는 이미지를 확인할 수 없습니다"라고 답한다 — 이름만 vision이다.
# 그래서 별칭이 아니라 실측으로 이미지 인식을 확인한 **구체 모델**을 쓰고, 그중
# 하나가 실패하면 다음으로 넘어간다.
# ---------------------------------------------------------------------------


def _models_seen(requests: list[httpx.Request]) -> list[str]:
    return [json.loads(r.content)["model"] for r in requests]


def _recording_client(
    handler: Callable[[httpx.Request], httpx.Response],
) -> tuple[httpx.AsyncClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def _record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return (
        httpx.AsyncClient(transport=httpx.MockTransport(_record), base_url="http://gateway/v1"),
        seen,
    )


def test_vision_chain_uses_concrete_models_not_auto_aliases() -> None:
    """`auto/*` 별칭을 쓰면 안 된다 — 그 별칭들이 눈뜬장님 모델로 라우팅되는 것이 실측됐다."""
    assert len(_VISION_MODELS) >= 2, "폴백 대상이 없으면 이 기능이 성립하지 않는다"
    for model in _VISION_MODELS:
        assert not model.startswith("auto/"), f"{model}: auto/* 별칭은 라우팅을 신뢰할 수 없다"


async def test_describe_image_falls_back_to_next_model() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == _VISION_MODELS[0]:
            return httpx.Response(502, text="upstream down")
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "은발에 붉은 눈동자, 흑색 장포"}}]}
        )

    client, seen = _recording_client(handler)
    try:
        assert await describe_image(_IMAGE_BYTES, client=client) == "은발에 붉은 눈동자, 흑색 장포"
    finally:
        await client.aclose()

    assert _models_seen(seen) == [_VISION_MODELS[0], _VISION_MODELS[1]]


async def test_describe_image_does_not_try_next_model_on_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "묘사"}}]})

    client, seen = _recording_client(handler)
    try:
        assert await describe_image(_IMAGE_BYTES, client=client) == "묘사"
    finally:
        await client.aclose()

    assert _models_seen(seen) == [_VISION_MODELS[0]]


async def test_describe_image_all_models_failing_raises_app_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="upstream down")

    client, seen = _recording_client(handler)
    try:
        with pytest.raises(AppError):
            await describe_image(_IMAGE_BYTES, client=client)
    finally:
        await client.aclose()

    assert _models_seen(seen) == list(_VISION_MODELS)


async def test_describe_image_sends_image_with_every_attempt() -> None:
    """폴백해도 이미지가 함께 가야 한다 — 이미지를 잃으면 폴백이 무의미하다."""

    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == _VISION_MODELS[0]:
            return httpx.Response(502, text="upstream down")
        return httpx.Response(200, json={"choices": [{"message": {"content": "묘사"}}]})

    client, seen = _recording_client(handler)
    try:
        await describe_image(_IMAGE_BYTES, client=client)
    finally:
        await client.aclose()

    for request in seen:
        parts = json.loads(request.content)["messages"][0]["content"]
        kinds = [p["type"] for p in parts]
        assert "image_url" in kinds, "모든 시도에 이미지가 실려야 한다"
        url = next(p["image_url"]["url"] for p in parts if p["type"] == "image_url")
        assert base64.b64encode(_IMAGE_BYTES).decode("ascii") in url
