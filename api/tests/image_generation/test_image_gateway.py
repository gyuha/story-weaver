"""게이트웨이 이미지 생성 어댑터 테스트 (plan.md S2, TDD).

실 네트워크를 타지 않는다 — ``httpx.MockTransport``로 게이트웨이 응답을 흉내낸다.
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from core.exceptions import AppError
from domains.image_generation.service.image_gateway import generate_image

pytestmark = pytest.mark.unit

_FAKE_JPEG = b"\xff\xd8\xff\xe0fake-jpeg-bytes"
_B64_JPEG = base64.b64encode(_FAKE_JPEG).decode()


def _patch_client(monkeypatch: pytest.MonkeyPatch, handler: object) -> list[httpx.Request]:
    """AsyncClient가 handler로 응답하도록 갈아치우고, 보낸 요청들을 기록해 돌려준다."""
    sent: list[httpx.Request] = []

    def _record_and_handle(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return handler(request)  # type: ignore[operator]

    transport = httpx.MockTransport(_record_and_handle)
    real_async_client = httpx.AsyncClient

    def _fake_async_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", _fake_async_client)
    return sent


async def test_generate_image_decodes_b64_json(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"b64_json": _B64_JPEG}]})

    _patch_client(monkeypatch, handler)

    result = await generate_image("은발에 붉은 눈동자, 흑색 장포")

    assert result == _FAKE_JPEG


async def test_generate_image_request_body_has_no_n_seed_size(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"b64_json": _B64_JPEG}]})

    sent = _patch_client(monkeypatch, handler)

    await generate_image("프롬프트")

    body = json.loads(sent[0].content)
    assert "n" not in body
    assert "seed" not in body
    assert "size" not in body
    assert body["model"] == "antigravity/gemini-3.1-flash-image"
    assert body["prompt"] == "프롬프트"


async def test_generate_image_non_200_becomes_app_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "boom"}})

    _patch_client(monkeypatch, handler)

    with pytest.raises(AppError):
        await generate_image("프롬프트")


async def test_generate_image_429_maps_to_quota_message(monkeypatch: pytest.MonkeyPatch) -> None:
    quota_message = (
        "You have exhausted your capacity on this model. Your quota will reset after 3h4m56s."
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": quota_message}})

    _patch_client(monkeypatch, handler)

    with pytest.raises(AppError) as exc_info:
        await generate_image("프롬프트")

    assert exc_info.value.status_code == 429
    # 정직한 사용자 대면 안내 — 시스템 오류로 위장하지 않고, 리셋 시각을 살린다.
    assert "한도" in exc_info.value.message
    assert "3h4m56s" in exc_info.value.message
