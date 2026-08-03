"""원고 계층 요청/응답 스키마.

응답은 works_schemas.py의 ``_CamelModel``과 동일한 camelCase 직렬화 패턴을 따른다.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """camelCase 직렬화 + 속성 매핑 공통 베이스."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class SynopsisUpdate(_CamelModel):
    """시놉시스 upsert 입력."""

    body: str = Field(default="")


class SynopsisResponse(_CamelModel):
    """시놉시스 응답."""

    id: uuid.UUID
    work_id: uuid.UUID
    body: str


class SynopsisContinueRequest(_CamelModel):
    """기획의도 AI 이어쓰기 입력 — 클라이언트가 보낸 현재 초안 텍스트(task #53)."""

    text: str

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        """빈/공백 텍스트는 LLM 제공사가 400으로 거부해 수위 거절로 오인된다 — 여기서 차단."""
        if not value.strip():
            raise ValueError("text는 비어 있을 수 없습니다")
        return value


class EpisodeCreate(_CamelModel):
    """부 생성 입력."""

    title: str = Field(min_length=1, max_length=255)
    order_index: int = Field(ge=0)


class EpisodeUpdate(_CamelModel):
    """부 수정 입력 — 모든 필드 선택(PATCH)."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    order_index: int | None = Field(default=None, ge=0)


class EpisodeResponse(_CamelModel):
    """부 응답."""

    id: uuid.UUID
    work_id: uuid.UUID
    title: str
    order_index: int


class ChapterCreate(_CamelModel):
    """챕터 생성 입력. ``global_seq``는 서버가 부여하므로 입력에 없다."""

    title: str = Field(min_length=1, max_length=255)
    order_index: int = Field(ge=0)
    body: str = Field(default="")


class ChapterUpdate(_CamelModel):
    """챕터 수정 입력 — 모든 필드 선택(PATCH). ``global_seq``는 수정 불가."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    order_index: int | None = Field(default=None, ge=0)
    body: str | None = None
    summary: str | None = None


class ChapterResponse(_CamelModel):
    """챕터 응답 — 본문(``body``)을 직접 보유한다(scenes 계층 폐지, remove-scene ADR)."""

    id: uuid.UUID
    work_id: uuid.UUID
    episode_id: uuid.UUID
    title: str
    order_index: int
    global_seq: int
    body: str
    summary: str | None = None
