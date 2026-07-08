"""엔티티 카드 → 이미지 프롬프트 변환 + 콘텐츠 정책 필터 (v2-D S1/S2, image-generation.md 3·4장).

S1(카드 필드→프롬프트 변환) — 인물 카드는 ``appearance``(외모, 3.1)만 시각 정보로
반영한다. ``personality``/``speech_style``/``sample_lines``/``relations``는 이미지에
직접 반영되지 않으므로 프롬프트에 넣지 않는다(넣으면 노이즈가 됨 — 3.1). 장소 카드는
``description``(환경/지형, 핵심)·``atmosphere``(분위기)·``region``(양식/문화권) 세
필드를 순서대로 반영한다(3.2).

S2(콘텐츠 정책 필터) — 텍스트 모더레이션(task 40, ``domains.moderation``)의 S1 선제
가드 원칙을 그대로 재사용한다(image-generation.md 4장: "전체이용가 상한은 이미지에도
동일 적용"). 별도 키워드 목록을 새로 만들지 않고 :func:`is_explicit_content`를 그대로
호출한다.
"""

from __future__ import annotations

from typing import Any

from domains.moderation.service import PRECHECK_DECLINE_MESSAGE, is_explicit_content


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


def check_prompt_policy(prompt: str) -> str | None:
    """*prompt*가 전체이용가 수위를 넘으면 완곡 거절 문구, 통과하면 None(4장)."""
    if is_explicit_content(prompt):
        return PRECHECK_DECLINE_MESSAGE
    return None
