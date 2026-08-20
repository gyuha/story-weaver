"""게이트웨이 이미지 생성 어댑터 테스트 (plan.md S2, TDD).

실 네트워크를 타지 않는다 — ``httpx.MockTransport``로 게이트웨이 응답을 흉내낸다.
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from core.exceptions import AppError
from domains.image_generation.service.image_gateway import _MODELS, generate_image

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


async def test_generate_image_timeout_maps_to_readable_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """게이트웨이가 제때 응답하지 않으면 **빈 메시지가 아니라** 이유가 보여야 한다.

    ``httpx.ReadTimeout``은 ``str(exc)``가 빈 문자열이라, 그대로 올리면 사용자 화면과
    ``llm_calls.error`` 컬럼이 **둘 다 비어** 원인을 알 수 없다. 실제로 그 때문에
    "생성이 안 되는데 이유를 모르겠다"는 상태가 됐고 로그로도 추적이 막혔다.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("")

    _patch_client(monkeypatch, handler)

    with pytest.raises(AppError) as exc_info:
        await generate_image("프롬프트")

    assert exc_info.value.status_code == 504
    assert exc_info.value.message.strip(), "타임아웃 메시지가 비어 있으면 원인을 알 수 없다"
    assert "시간" in exc_info.value.message


# ---------------------------------------------------------------------------
# 모델 폴백 — 한 모델이 실패하면 다음 모델로 넘어간다
#
# 게이트웨이의 `/models`에는 이미지 후보가 15개 있지만 `/images/generations`에서
# 실제로 동작하는 것은 2개뿐이다(실측): gemini 계열은 400 "not an Imagen model",
# imagen 계열은 404 upstream_error, flux.1-schnell은 무응답이었다. 그리고
# flux.1-dev는 200을 주지만 **한국어 프롬프트를 무시**해(무협 검객 요청에 꽃 그림)
# 폴백 후보에서 뺐다 — 동작하는 것과 쓸 수 있는 것은 다르다.
# ---------------------------------------------------------------------------


def _ok() -> httpx.Response:
    return httpx.Response(200, json={"data": [{"b64_json": _B64_JPEG}]})


def _models_of(sent: list[httpx.Request]) -> list[str]:
    return [json.loads(r.content)["model"] for r in sent]


async def test_fallback_chain_starts_with_primary_model() -> None:
    """첫 시도는 실측으로 검증된 기본 모델이어야 한다."""
    assert _MODELS[0] == "antigravity/gemini-3.1-flash-image"
    assert len(_MODELS) >= 2, "폴백할 대상이 없으면 이 기능이 성립하지 않는다"


async def test_generate_image_falls_back_to_next_model_on_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == _MODELS[0]:
            raise httpx.ReadTimeout("")
        return _ok()

    sent = _patch_client(monkeypatch, handler)

    assert await generate_image("프롬프트") == _FAKE_JPEG
    assert _models_of(sent) == [_MODELS[0], _MODELS[1]]


async def test_generate_image_falls_back_on_429(monkeypatch: pytest.MonkeyPatch) -> None:
    """쿼터 소진은 폴백해야 하는 대표 사례다 — 실제로 이 저장소에서 생성을 막았다."""

    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == _MODELS[0]:
            return httpx.Response(429, json={"error": {"message": "quota exhausted"}})
        return _ok()

    sent = _patch_client(monkeypatch, handler)

    assert await generate_image("프롬프트") == _FAKE_JPEG
    assert _models_of(sent) == [_MODELS[0], _MODELS[1]]


async def test_generate_image_falls_back_on_400(monkeypatch: pytest.MonkeyPatch) -> None:
    """400도 폴백 대상이다 — 어떤 모델은 이 엔드포인트를 아예 받지 않는다(실측)."""

    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["model"] == _MODELS[0]:
            return httpx.Response(400, json={"error": {"message": "not an Imagen model"}})
        return _ok()

    sent = _patch_client(monkeypatch, handler)

    assert await generate_image("프롬프트") == _FAKE_JPEG
    assert _models_of(sent) == [_MODELS[0], _MODELS[1]]


async def test_generate_image_does_not_try_next_model_on_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """첫 모델이 성공하면 뒤 모델은 건드리지 않는다(쿼터·시간 낭비 방지)."""
    sent = _patch_client(monkeypatch, lambda request: _ok())

    assert await generate_image("프롬프트") == _FAKE_JPEG
    assert _models_of(sent) == [_MODELS[0]]


async def test_generate_image_all_models_failing_raises_app_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """전부 실패하면 AppError로 끝나고, 모든 모델을 실제로 시도했어야 한다."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "quota exhausted"}})

    sent = _patch_client(monkeypatch, handler)

    with pytest.raises(AppError) as exc_info:
        await generate_image("프롬프트")

    assert exc_info.value.status_code == 429
    assert _models_of(sent) == list(_MODELS)
