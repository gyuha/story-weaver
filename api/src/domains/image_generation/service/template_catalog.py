"""이미지 템플릿 카탈로그 로더 (S2, `.forge/plan.md` — 화풍·구도 축 분리).

`api/assets/image-templates/templates.json`을 화풍(``styles`` 4개) + 카드 유형별
구도(``compositions`` 4개)로 1회 로드 + pydantic 검증해 캐시한다. 형식이 깨졌으면
예외를 던져 부팅에서 드러나게 한다 — 조용히 빈 목록을 돌려주지 않는다. JSON의
``$comment``·``sample_subject``는 각 스키마의 ``extra="ignore"``가 조용히 걸러낸다
(``sample_subject``는 샘플 재생성용 내부 데이터라 API 응답에 넣지 않는다).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import TypeAdapter

from domains.image_generation.schemas import ArtStyleFragment, CompositionFragment

_ASSETS_DIR = Path(__file__).resolve().parents[4] / "assets" / "image-templates"
_CATALOG_PATH = _ASSETS_DIR / "templates.json"

_styles_adapter = TypeAdapter(list[ArtStyleFragment])
_compositions_adapter = TypeAdapter(list[CompositionFragment])


@lru_cache
def _load_catalog() -> tuple[list[ArtStyleFragment], list[CompositionFragment]]:
    """카탈로그 JSON을 읽고 검증한다. 형식이 깨졌으면 예외가 그대로 올라간다."""
    data = json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    styles = _styles_adapter.validate_python(data["styles"])
    compositions = _compositions_adapter.validate_python(data["compositions"])
    return styles, compositions


def list_art_styles() -> list[ArtStyleFragment]:
    """화풍 카탈로그 4개."""
    styles, _ = _load_catalog()
    return styles


def get_art_style(style_id: str) -> ArtStyleFragment | None:
    """id로 화풍 한 건을 조회한다. 없으면 ``None``."""
    return next((s for s in list_art_styles() if s.id == style_id), None)


def list_compositions() -> list[CompositionFragment]:
    """카드 유형별 구도 카탈로그 4개."""
    _, compositions = _load_catalog()
    return compositions


def get_composition(entity_type: str) -> CompositionFragment | None:
    """카드 유형으로 구도 한 건을 조회한다. 없으면 ``None``."""
    return next((c for c in list_compositions() if c.entity_type == entity_type), None)


def compose_prompt_suffix(style_id: str, entity_type: str) -> str:
    """(화풍, 카드 유형)으로 화풍 조각 + 구도 조각을 이어붙인 suffix를 조립한다.

    화풍·유형 중 하나라도 카탈로그에 없으면 ``ValueError``로 명확히 실패한다
    (조용히 빈 문자열이나 부분 조립을 돌려주지 않는다).
    """
    style = get_art_style(style_id)
    if style is None:
        raise ValueError(f"알 수 없는 화풍 id: {style_id!r}")
    composition = get_composition(entity_type)
    if composition is None:
        raise ValueError(f"알 수 없는 카드 유형: {entity_type!r}")
    return f"{style.prompt_fragment}, {composition.prompt_fragment}"


def sample_path(style_id: str, entity_type: str) -> Path:
    """샘플 썸네일 파일 경로를 조립한다(``<style>-<type>.jpg``). 존재 여부는 호출자가 확인한다."""
    return _ASSETS_DIR / "samples" / f"{style_id}-{entity_type}.jpg"
