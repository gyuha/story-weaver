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

_MODEL = "antigravity/gemini-3.1-flash-image"
_PROVIDER = "openai_compatible"
_TASK = "image_generation"

# 실측 18~60초, 한 번은 60초를 넘겼다 — 넉넉히 여유를 둔다.
_TIMEOUT = httpx.Timeout(120.0)


def _log_call(*, prompt: str, start: float, error: str | None) -> None:
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
            model=_MODEL,
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


async def generate_image(prompt: str) -> bytes:
    """prompt로 이미지를 생성해 디코드된 이미지 바이트를 돌려준다.

    ``n``·``seed``·``size``는 보내지 않는다 — 실측(ADR 260811-234511)으로
    각각 400 / 무효(같은 seed도 결과가 달라짐) / 비율 힌트일 뿐이라, 보내면
    이 API를 오해하게 만든다.
    """
    base_url = settings.llm.openai_compatible_base_url
    api_key = settings.llm.openai_compatible_api_key.get_secret_value()
    start = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{base_url}/images/generations",
                json={"model": _MODEL, "prompt": prompt},
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
    except Exception as exc:
        _log_call(prompt=prompt, start=start, error=str(exc))
        raise
    _log_call(prompt=prompt, start=start, error=None)
    return image
