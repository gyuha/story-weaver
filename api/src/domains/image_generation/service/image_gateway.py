"""게이트웨이 이미지 생성 어댑터 (plan.md S2, ADR 260811-234511).

``litellm.aimage_generation``이 openai_compatible 커스텀 base URL로 통하는지는
미확인이고, ``httpx``는 이미 의존성(OAuth 어댑터들이 이미 이 패턴을 씀)이라
확인 없이 직접 POST로 간다(ADR 260811-234511의 실측 표를 그대로 따름).
"""

from __future__ import annotations

import asyncio
import base64
import time

import httpx
import structlog

from core.config import settings
from core.exceptions import AppError
from core.llm_call_context import get_llm_call_context
from domains.chat.repository.llm_call_log_repository import save_llm_call_log

# 폴백 체인 — 앞에서부터 시도하고, 성공하지 못하면 다음으로 넘어간다.
#
# 게이트웨이의 ``/models``에는 이미지 후보가 15개 있으나 ``/images/generations``에서
# 실제로 쓸 수 있는 것은 아래 둘뿐이다(2026-08-19 실측):
#   · gemini/* flash-image·pro-image 계열 → 400 "not an Imagen model.
#     Gemini flash-image models route through /v1/chat/completions"
#   · gemini/imagen-4.0-* → 404 upstream_error
#   · nvidia/…/flux.1-schnell → 150초 무응답
#   · nvidia/…/flux.1-dev → 200이지만 **한국어 프롬프트를 무시한다**(무협 검객을
#     요청했는데 꽃 그림이 나왔다). 동작하는 것과 쓸 수 있는 것은 다르므로 제외.
# flux.2-klein-4b는 한국어를 정확히 반영하고 1.3초로 가장 빠르다.
_MODELS: tuple[str, ...] = (
    "antigravity/gemini-3.1-flash-image",
    "nvidia/black-forest-labs/flux.2-klein-4b",
)
_PROVIDER = "openai_compatible"
_TASK = "image_generation"

# 실측 18~60초, 한 번은 60초를 넘겼다 — 넉넉히 여유를 둔다.
_TIMEOUT = httpx.Timeout(120.0)


def _log_call(*, model: str, prompt: str, start: float, error: str | None) -> None:
    """이 호출을 ``llm_calls``에 기록한다(fire-and-forget, ADR-0009).

    ``ChatLiteLLM``을 타지 않아 자동 로깅이 안 붙으므로 직접 붙인다. 이미지
    바이트는 담지 않는다 — ``response``는 항상 null(plan.md S4).
    """
    latency_ms = int((time.monotonic() - start) * 1000)
    ctx = get_llm_call_context()
    correlation_id = structlog.contextvars.get_contextvars().get("correlation_id")
    asyncio.create_task(  # noqa: RUF006 - intentional fire-and-forget (ADR-0009)
        save_llm_call_log(
            correlation_id=correlation_id,
            user_id=ctx.user_id,
            task=_TASK,
            model=model,
            provider=_PROVIDER,
            messages=[{"role": "user", "content": prompt}],
            response=None,
            error=error,
            latency_ms=latency_ms,
        )
    )


def _extract_error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict) and error.get("message"):
        return str(error["message"])
    return response.text


async def _generate_with_model(model: str, prompt: str, base_url: str, api_key: str) -> bytes:
    """한 모델로 **1회** 시도한다. 실패는 그대로 올려 호출자가 다음 모델로 넘어가게 한다.

    ``n``·``seed``·``size``는 보내지 않는다 — 실측(ADR 260811-234511)으로
    각각 400 / 무효(같은 seed도 결과가 달라짐) / 비율 힌트일 뿐이라, 보내면
    이 API를 오해하게 만든다.
    """
    start = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{base_url}/images/generations",
                json={"model": model, "prompt": prompt},
                headers={"Authorization": f"Bearer {api_key}"},
            )

        if response.status_code == 429:
            message = _extract_error_message(response)
            raise AppError(
                f"지금 이미지 생성이 한도에 걸렸습니다. {message}".strip(),
                status_code=429,
            )
        if response.status_code != 200:
            raise AppError(
                f"이미지 생성 요청이 실패했습니다 (status={response.status_code}): "
                f"{_extract_error_message(response)}",
                status_code=502,
            )

        data = response.json()
        b64_json: str = data["data"][0]["b64_json"]
        image = base64.b64decode(b64_json)
    except httpx.TimeoutException as exc:
        # ``str(httpx.ReadTimeout(""))``은 **빈 문자열**이다. 그대로 올리면 사용자 화면과
        # ``llm_calls.error``가 둘 다 비어 "실패했다"만 남고 무엇이 실패했는지가 사라진다
        # (실측: 120초짜리 실패 4건이 error=''로 기록돼 로그만으로 원인 추적이 막혔다).
        # 그래서 타임아웃만 따로 잡아 로그에는 예외 타입을, 사용자에게는 이유를 남긴다.
        _log_call(
            model=model,
            prompt=prompt,
            start=start,
            error=f"{type(exc).__name__}: 게이트웨이가 {_TIMEOUT.read:.0f}초 안에 응답하지 않음",
        )
        raise AppError(
            "이미지 생성이 제한 시간 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.",
            status_code=504,
        ) from exc
    except Exception as exc:
        _log_call(model=model, prompt=prompt, start=start, error=str(exc))
        raise
    _log_call(model=model, prompt=prompt, start=start, error=None)
    return image


async def generate_image(prompt: str) -> bytes:
    """prompt로 이미지를 생성해 디코드된 이미지 바이트를 돌려준다.

    ``_MODELS``를 앞에서부터 시도하고 **첫 성공에서 멈춘다**. 한 모델이 어떤 이유로든
    실패하면(쿼터 429 · 타임아웃 · 5xx · 그 모델이 이 엔드포인트를 받지 않는 400 ·
    응답 형식이 달라 디코드 실패) 다음 모델로 넘어가고, 전부 실패하면 **마지막 실패를**
    올린다. 각 시도는 ``llm_calls``에 자기 모델 이름으로 한 행씩 남으므로, 폴백이
    일어났는지와 어디서 멈췄는지는 그 로그로 추적한다.
    """
    base_url = settings.llm.openai_compatible_base_url
    api_key = settings.llm.openai_compatible_api_key.get_secret_value()

    last_exc: Exception | None = None
    for model in _MODELS:
        try:
            return await _generate_with_model(model, prompt, base_url, api_key)
        except Exception as exc:  # 다음 모델로 넘어가기 위해 의도적으로 넓게 잡는다
            last_exc = exc

    # _MODELS가 비어 있지 않은 한 여기 도달하면 last_exc는 반드시 채워져 있다.
    assert last_exc is not None
    raise last_exc
