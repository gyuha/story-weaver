"""엔티티 카드 → 이미지 프롬프트 변환 (v2-D S1, image-generation.md 3장).

S1(카드 필드→프롬프트 변환) — 인물 카드는 ``appearance``(외모, 3.1)만 시각 정보로
반영한다. ``personality``/``speech_style``/``sample_lines``/``relations``는 이미지에
직접 반영되지 않으므로 프롬프트에 넣지 않는다(넣으면 노이즈가 됨 — 3.1). 장소 카드는
``description``(환경/지형, 핵심)·``atmosphere``(분위기)·``region``(양식/문화권) 세
필드를 순서대로 반영한다(3.2).

콘텐츠 정책 필터는 두지 않는다 — 제품이 강제하는 연령·수위 제한을 제거했고 정책
집행은 모델 제공자에게 위임한다(ADR `260730-070532`). `image-generation.md` 4장의
"전체이용가 상한" 기술은 그 ADR 이후 무효다.
"""

from __future__ import annotations

from typing import Any


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
