"""이미지 템플릿 카탈로그 응답 스키마 (S4, `.forge/CONTEXT.md` '이미지 템플릿').

``entity_type``은 `domains.worldbible.models.EntityType`을 그대로 쓰지 않는다 —
도메인 간 직접 DB 모델 import를 금지하는 규칙(`api/CLAUDE.md`) 때문에, 값이 같은
문자열 리터럴을 이 도메인에서 자체 선언한다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

EntityTypeLiteral = Literal["character", "location", "event", "item"]


class ArtStyleFragment(BaseModel):
    """화풍 카탈로그 한 항목. 매체·기법만 담는다(구도·배경은 :class:`CompositionFragment`)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    label: str
    prompt_fragment: str


class CompositionFragment(BaseModel):
    """카드 유형별 구도 카탈로그 한 항목. 구도·배경·품질만 담는다(화풍은 :class:`ArtStyleFragment`).

    ``sample_subject``는 샘플 재생성용 내부 데이터라 ``extra="ignore"``로 걸러낸다.
    """

    model_config = ConfigDict(extra="ignore")

    entity_type: EntityTypeLiteral
    prompt_fragment: str
