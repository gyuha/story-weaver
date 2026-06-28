"""FastAPI OpenAPI 스펙을 루트 ``docs/openapi.json``으로 덤프한다 (ADR-0006).

code-first 계약 파이프라인의 익스포트 단계: 백엔드 스키마가 단일 출처이고,
프론트는 이 파일을 ``pnpm generate``로 소비한다. DB/Redis 연결 없이 스키마만 만든다.

Usage::

    uv run python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# src layout: ``main`` 모듈이 api/src/ 아래 있으므로 path에 추가 (PYTHONPATH=src 미설정 시)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from main import app

# api/scripts/ → repo 루트 → docs/openapi.json
_OUTPUT = Path(__file__).resolve().parent.parent.parent / "docs" / "openapi.json"


def main() -> None:
    spec = app.openapi()
    _OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OpenAPI spec written to {_OUTPUT}")


if __name__ == "__main__":
    main()
