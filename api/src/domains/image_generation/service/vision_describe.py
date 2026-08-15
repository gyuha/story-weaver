"""비전 역번역: 생성된 엔티티 이미지를 비전 모델에 되먹여 한국어 [[시각 묘사]]를 뽑는다.

레퍼런스 이미지 입력과 seed가 모두 막혀 있는 이 게이트웨이에서, 캐릭터 일관성을
만드는 유일한 수단이다(ADR `260811-234512`). ``stream``을 명시하지 않으면
게이트웨이가 SSE(``data: {...}``)로 응답해 JSON 파싱이 깨진다(실측,
ADR `260811-234511`) — 그래서 ``stream: false``를 반드시 명시한다.
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

_VISION_MODEL = "auto/best-vision"
_PROVIDER = "openai_compatible"
_TASK = "image_description"
_TIMEOUT = 90.0  # eco: 실측 소요 없음. 60초 이미지 생성 실측을 참고한 여유값.
_PROMPT = (
    "이 이미지에 등장하는 인물/장소/사물을 나중에 같은 모습으로 다시 그릴 수 있도록 "
    "얼굴, 머리 색상과 형태, 체형, 복장과 색상을 구체적으로 한국어로 묘사해줘. "
    "배경은 묘사에서 제외해줘."
)


def _log_call(*, start: float, error: str | None) -> None:
    """이 호출을 ``llm_calls``에 기록한다(fire-and-forget, ADR-0009).

    ``image_gateway._log_call``과 동일 패턴. ``response``는 항상 null(plan.md S4).
    """
    latency_ms = int((time.monotonic() - start) * 1000)
    ctx = get_llm_call_context()
    correlation_id = structlog.contextvars.get_contextvars().get("correlation_id")
    asyncio.create_task(  # noqa: RUF006 - intentional fire-and-forget (ADR-0009)
        save_llm_call_log(
            correlation_id=correlation_id,
            user_id=ctx.user_id,
            task=_TASK,
            model=_VISION_MODEL,
            provider=_PROVIDER,
            messages=[{"role": "user", "content": _PROMPT}],
            response=None,
            error=error,
            latency_ms=latency_ms,
        )
    )


async def describe_image(data: bytes, *, client: httpx.AsyncClient | None = None) -> str:
    """이미지 바이트를 비전 모델에 보내 한국어 시각 묘사 문자열을 돌려준다."""
    llm = settings.llm
    data_uri = f"data:image/jpeg;base64,{base64.b64encode(data).decode('ascii')}"
    body = {
        "model": _VISION_MODEL,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
    }

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(base_url=llm.openai_compatible_base_url, timeout=_TIMEOUT)
    start = time.monotonic()
    try:
        try:
            response = await client.post(
                "/chat/completions",
                json=body,
                headers={
                    "Authorization": f"Bearer {llm.openai_compatible_api_key.get_secret_value()}"
                },
            )

            if response.status_code != 200:
                raise AppError(f"비전 모델 호출 실패: HTTP {response.status_code}", status_code=502)

            try:
                payload = response.json()
                content = payload["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                raise AppError("비전 모델 응답 형식이 올바르지 않습니다.", status_code=502) from exc

            if not isinstance(content, str) or not content.strip():
                raise AppError("비전 모델이 빈 응답을 반환했습니다.", status_code=502)
        except Exception as exc:
            _log_call(start=start, error=str(exc))
            raise
        _log_call(start=start, error=None)
        return content
    finally:
        if owns_client:
            await client.aclose()
