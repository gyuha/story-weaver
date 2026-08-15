#!/usr/bin/env python3
"""이미지 템플릿 샘플 썸네일 생성기 — 개발 시 1회용 스크립트 (런타임 코드 아님).

``templates.json``의 화풍(``styles``) x 구도(``compositions``) 조합마다
``sample_subject + style.prompt_fragment + composition.prompt_fragment``로 게이트웨이를
호출하고, 결과 JPEG를 ``samples/<style>-<type>.jpg``에 **320px로 축소해** 저장한다. 축소는
``sips``(macOS 내장)로 한다 — 축소 목적의 의존성을 새로 들이지 않기 위해서다. 원본은
장당 683~871KB로 ``.pre-commit-config.yaml``의 ``check-added-large-files --maxkb=1000``에
아슬아슬하고, 화면 표시 크기는 74px이라 320px로 충분하다.

이미 있는 샘플은 건너뛴다(재생성하려면 해당 파일을 지운다).

    cd api && python3 scripts/generate_template_samples.py

게이트웨이 자격증명은 ``.env``의 ``OPENAI_COMPATIBLE_BASE_URL``/``OPENAI_COMPATIBLE_API_KEY``
에서 읽는다(ADR 260811-234511). 표준 라이브러리만 쓴다.

**게이트웨이 레이트리밋**: 실측에서 연속 11장을 만든 뒤 ``429 Too Many Requests``가 나고
백오프 4회(60·120·180·240초)로도 풀리지 않았다. 남은 샘플은 시간이 지난 뒤 이 스크립트를
다시 돌려 채운다 — 이미 있는 파일은 건너뛰므로 몇 번 돌려도 안전하다.
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

IMAGE_MODEL = "antigravity/gemini-3.1-flash-image"
THUMB_PX = 320
TIMEOUT_S = 300
RETRIES = 5
BACKOFF_S = 60

API_DIR = Path(__file__).resolve().parents[1]
ASSETS = API_DIR / "assets" / "image-templates"
SAMPLES = ASSETS / "samples"


def read_env(api_dir: Path) -> tuple[str, str]:
    """``.env``에서 게이트웨이 base URL과 키를 읽는다 (pydantic 없이, 이 스크립트 전용)."""
    values: dict[str, str] = {}
    for line in (api_dir / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(("OPENAI_COMPATIBLE_BASE_URL=", "OPENAI_COMPATIBLE_API_KEY=")):
            key, _, value = line.partition("=")
            values[key] = value.strip()
    return values["OPENAI_COMPATIBLE_BASE_URL"], values["OPENAI_COMPATIBLE_API_KEY"]


def generate(base_url: str, api_key: str, prompt: str) -> bytes:
    """``/v1/images/generations``를 호출해 JPEG 바이트를 돌려준다.

    ``n``/``seed``/``size``는 보내지 않는다 — 실측에서 각각 400·무효·비율 힌트였다
    (ADR 260811-234511의 제약표).

    **429 재시도**: 실측에서 연속 11장을 만든 뒤 게이트웨이가 ``429 Too Many Requests``를
    돌려줬다. 백오프 없이는 16장을 한 번에 못 채운다.
    """
    body = json.dumps({"model": IMAGE_MODEL, "prompt": prompt}).encode()
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/images/generations",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
                payload = json.loads(response.read())
            return base64.b64decode(payload["data"][0]["b64_json"])
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == RETRIES - 1:
                raise
            wait_s = BACKOFF_S * (attempt + 1)
            print(f"      429 — {wait_s}s 대기 후 재시도 ({attempt + 1}/{RETRIES - 1})", flush=True)
            time.sleep(wait_s)
    raise RuntimeError("unreachable")  # pragma: no cover


def main() -> int:
    base_url, api_key = read_env(API_DIR)
    catalog = json.loads((ASSETS / "templates.json").read_text(encoding="utf-8"))
    SAMPLES.mkdir(exist_ok=True)

    failures: list[str] = []
    for style in catalog["styles"]:
        for composition in catalog["compositions"]:
            template_id = f"{style['id']}-{composition['entity_type']}"
            target = SAMPLES / f"{template_id}.jpg"
            if target.exists():
                print(f"skip  {template_id} (이미 있음)", flush=True)
                continue

            prompt = (
                f"{composition['sample_subject']}. "
                f"{style['prompt_fragment']}, {composition['prompt_fragment']}"
            )
            started = time.monotonic()
            try:
                target.write_bytes(generate(base_url, api_key, prompt))
            except (urllib.error.URLError, OSError, KeyError, ValueError) as exc:
                failures.append(f"{template_id}: {type(exc).__name__} {exc}")
                print(f"FAIL  {template_id} — {type(exc).__name__} {exc}", flush=True)
                continue

            subprocess.run(
                ["sips", "-Z", str(THUMB_PX), str(target)], check=True, capture_output=True
            )
            size_kb = target.stat().st_size // 1024
            print(
                f"ok    {template_id} — {size_kb}KB, {time.monotonic() - started:.0f}s",
                flush=True,
            )

    if failures:
        print(f"\n{len(failures)}건 실패:", flush=True)
        for failure in failures:
            print(f"  - {failure}", flush=True)
        return 1
    print("\n전부 완료", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
