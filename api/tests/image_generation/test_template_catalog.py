"""image_generation 도메인 S2 — 화풍·구도 축 분리 카탈로그 로더 테스트 (TDD).

`api/assets/image-templates/templates.json`(화풍 14 + 카드 유형별 구도 4)을 1회
로드 + pydantic 검증해 조회·조립하는
:mod:`domains.image_generation.service.template_catalog`를 검증한다. DB·네트워크 없음.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from domains.image_generation.service import template_catalog
from domains.image_generation.service.template_catalog import (
    compose_prompt_suffix,
    get_art_style,
    get_composition,
    list_art_styles,
    list_compositions,
    sample_path,
)

pytestmark = pytest.mark.unit

STYLE_IDS = [
    "ink",
    "webtoon",
    "oil",
    "photo",
    "anime",
    "shoujo",
    "watercolor",
    "pen",
    "concept",
    "render3d",
    "noir",
    "oriental",
    "cyberpunk",
    "darkfantasy",
]
ENTITY_TYPES = ["character", "location", "event", "item"]

# 견본 썸네일이 **실제로 존재해야 하는** (화풍, 유형) 조합. 파일명 규약(모든 조합에서 성립)과
# 파일 존재(견본을 만든 조합에서만 성립)는 다른 명제라 나눠 검증한다.
# 기존 4종은 event 포함 4유형이 다 있고, 새 10종은 화면이 쓰는 3유형만 갖는다(event 미생성).
_LEGACY_STYLES = ["ink", "webtoon", "oil", "photo"]  # event 포함 4유형 견본을 갖고 있다
_NEW_STYLES_WITH_SAMPLES = [  # 3유형 견본을 갖춘 새 화풍 (task 83에서 채웠다)
    "anime",
    "shoujo",
    "watercolor",
    "pen",
    "concept",
    "render3d",
    "noir",
    "oriental",
    "cyberpunk",
    "darkfantasy",
]
_SCREEN_ENTITY_TYPES = ["character", "location", "item"]  # 화풍 선택 화면이 렌더하는 3유형
SAMPLE_COMBINATIONS = [(s, t) for s in _LEGACY_STYLES for t in ENTITY_TYPES] + [
    (s, t) for s in _NEW_STYLES_WITH_SAMPLES for t in _SCREEN_ENTITY_TYPES
]


# ---------------------------------------------------------------------------
# 정상 카탈로그 — 화풍 14 + 구도 4
# ---------------------------------------------------------------------------


def test_list_art_styles_returns_14() -> None:
    styles = list_art_styles()
    assert len(styles) == 14
    assert {s.id for s in styles} == set(STYLE_IDS)


def test_list_compositions_returns_4() -> None:
    compositions = list_compositions()
    assert len(compositions) == 4
    assert {c.entity_type for c in compositions} == set(ENTITY_TYPES)


def test_get_art_style_known_id_returns_fragment() -> None:
    style = get_art_style("ink")
    assert style is not None
    assert style.id == "ink"
    assert style.prompt_fragment


def test_get_art_style_unknown_id_returns_none() -> None:
    assert get_art_style("no-such-style") is None


def test_get_composition_known_type_returns_fragment() -> None:
    composition = get_composition("character")
    assert composition is not None
    assert composition.entity_type == "character"


def test_get_composition_unknown_type_returns_none() -> None:
    assert get_composition("no-such-type") is None


def test_composition_has_no_sample_subject_attribute() -> None:
    composition = get_composition("character")
    assert composition is not None
    assert not hasattr(composition, "sample_subject")


# ---------------------------------------------------------------------------
# 조립 — 목표 명제: 화풍 어휘 + 구도 어휘가 모두 들어가고 중복 어구가 없다
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("style_id", STYLE_IDS)
@pytest.mark.parametrize("entity_type", ENTITY_TYPES)
def test_compose_prompt_suffix_contains_both_vocabularies(style_id: str, entity_type: str) -> None:
    suffix = compose_prompt_suffix(style_id, entity_type)
    style = get_art_style(style_id)
    composition = get_composition(entity_type)
    assert style is not None
    assert composition is not None

    assert style.prompt_fragment in suffix
    assert composition.prompt_fragment in suffix

    # 중복 어구 없음: 쉼표로 나눈 절 목록에 같은 절이 두 번 나오지 않는다.
    clauses = [c.strip() for c in suffix.split(",")]
    assert len(clauses) == len(set(clauses))


def test_compose_prompt_suffix_unknown_style_raises() -> None:
    with pytest.raises(ValueError, match="화풍"):
        compose_prompt_suffix("no-such-style", "character")


def test_compose_prompt_suffix_unknown_entity_type_raises() -> None:
    with pytest.raises(ValueError, match="유형"):
        compose_prompt_suffix("ink", "no-such-type")


# ---------------------------------------------------------------------------
# 샘플 파일명 규약 — <style>-<type>.jpg가 실제 파일을 가리킨다
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("style_id", STYLE_IDS)
@pytest.mark.parametrize("entity_type", ENTITY_TYPES)
def test_sample_path_follows_naming_convention(style_id: str, entity_type: str) -> None:
    """파일명 규약은 견본 존재 여부와 무관하게 모든 조합에서 성립한다."""
    assert sample_path(style_id, entity_type).name == f"{style_id}-{entity_type}.jpg"


@pytest.mark.parametrize(("style_id", "entity_type"), SAMPLE_COMBINATIONS)
def test_sample_file_exists(style_id: str, entity_type: str) -> None:
    """견본이 있어야 하는 조합은 실제 파일을 가리킨다."""
    assert sample_path(style_id, entity_type).is_file()


# ---------------------------------------------------------------------------
# 방어 — 형식이 깨진 JSON은 예외를 던진다(조용히 빈 목록을 돌려주지 않는다)
# ---------------------------------------------------------------------------


def test_broken_catalog_json_raises_on_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    broken_path = tmp_path / "templates.json"
    broken_path.write_text(
        json.dumps({"styles": [{"id": "x"}], "compositions": []}), encoding="utf-8"
    )
    monkeypatch.setattr(template_catalog, "_CATALOG_PATH", broken_path)
    template_catalog._load_catalog.cache_clear()
    with pytest.raises(Exception):  # 검증 예외 종류를 규정하지 않음
        template_catalog._load_catalog()
    template_catalog._load_catalog.cache_clear()
