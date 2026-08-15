"""엔티티 카드 → 이미지 프롬프트 변환 (v2-D S1 + entity-setting-image-2of3 S1, image-generation.md).

S1(카드 필드→프롬프트 변환) — 인물 카드는 ``appearance``(외모, 3.1)만 시각 정보로
반영한다. ``personality``/``speech_style``/``sample_lines``/``relations``는 이미지에
직접 반영되지 않으므로 프롬프트에 넣지 않는다(넣으면 노이즈가 됨 — 3.1). 장소 카드는
``description``(환경/지형, 핵심)·``atmosphere``(분위기)·``region``(양식/문화권) 세
필드를 순서대로 반영한다(3.2). 사건·아이템 매핑은 문서에 없어 이번에 정한다 —
``worldbible_schemas.py``의 ``participants``/``occurred_at_scene``/``owner``는
다른 엔티티를 가리키는 UUID일 뿐 시각 정보가 아니므로 제외하고, 자유 텍스트 필드
(``description``·``properties``)만 반영한다.

콘텐츠 정책 필터는 두지 않는다 — 제품이 강제하는 연령·수위 제한을 제거했고 정책
집행은 모델 제공자에게 위임한다(ADR `260730-070532`). `image-generation.md` 4장의
"전체이용가 상한" 기술은 그 ADR 이후 무효다.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from domains.image_generation.schemas import EntityTypeLiteral
from domains.image_generation.service.template_catalog import compose_prompt_suffix


def map_character_to_prompt(attributes: dict[str, Any]) -> str:
    """인물 카드 attributes → 이미지 프롬프트. 외모(appearance)만 반영한다(3.1)."""
    return str(attributes.get("appearance", "")).strip()


def map_location_to_prompt(attributes: dict[str, Any]) -> str:
    """장소 카드 attributes → 이미지 프롬프트. 환경·분위기·양식을 순서대로 결합한다(3.2)."""
    slots = (
        attributes.get("description", ""),
        attributes.get("atmosphere", ""),
        attributes.get("region", ""),
    )
    return ", ".join(str(slot).strip() for slot in slots if str(slot).strip())


def map_event_to_prompt(attributes: dict[str, Any]) -> str:
    """사건 카드 attributes → 이미지 프롬프트. ``description``만 반영한다.

    ``participants``·``occurred_at_scene``은 다른 엔티티/씬을 가리키는 UUID라
    시각 정보가 아니므로 넣지 않는다.
    """
    return str(attributes.get("description", "")).strip()


def map_item_to_prompt(attributes: dict[str, Any]) -> str:
    """아이템 카드 attributes → 이미지 프롬프트. 묘사·속성을 순서대로 결합한다.

    ``owner``는 다른 엔티티를 가리키는 UUID라 시각 정보가 아니므로 넣지 않는다.
    """
    slots = (attributes.get("description", ""), attributes.get("properties", ""))
    return ", ".join(str(slot).strip() for slot in slots if str(slot).strip())


_MAPPERS: dict[EntityTypeLiteral, Callable[[dict[str, Any]], str]] = {
    "character": map_character_to_prompt,
    "location": map_location_to_prompt,
    "event": map_event_to_prompt,
    "item": map_item_to_prompt,
}


def build_entity_image_prompt(
    art_style_id: str,
    work_tone: str,
    entity_type: EntityTypeLiteral,
    attributes: dict[str, Any],
    visual_description: str | None = None,
    extra_prompt: str = "",
) -> str:
    """엔티티 카드 + 작품 화풍 → 최종 이미지 프롬프트 조립 (`.forge/adr/260813-110724`).

    순서: 주 묘사 → 추가 지시 → 작품 톤 → 화풍 조각 → 구도 조각.

    [[시각 묘사]](``visual_description``)가 있으면 카드 필드를 **대체**해 주 묘사로
    쓴다(이어붙이지 않음 — ADR `260811-234512`, 재생성 일관성의 전부). 없으면
    유형별 매퍼로 카드 필드에서 뽑는다. 화풍·구도 조각은
    :func:`template_catalog.compose_prompt_suffix`로 조립한다(``art_style_id``·
    ``entity_type``이 카탈로그에 없으면 ``ValueError``가 그대로 올라간다). 빈
    조각(공백만인 작품 톤 포함)은 결합에서 제외해 구분자만 남기지 않는다.
    """
    primary = (
        visual_description.strip()
        if visual_description and visual_description.strip()
        else _MAPPERS[entity_type](attributes)
    )
    style_and_composition = compose_prompt_suffix(art_style_id, entity_type)
    parts = (primary, extra_prompt.strip(), work_tone.strip(), style_and_composition)
    return ". ".join(part for part in parts if part)
