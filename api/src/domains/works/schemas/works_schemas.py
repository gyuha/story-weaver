"""작품(Work) 요청/응답 스키마.

응답은 프론트 목업 ``Work`` 타입(camelCase)에 맞춰 alias로 직렬화한다
(shortLabel·subGenre·coverTheme·lastEditedLabel). stats·reviewSummary·lastEditedLabel은
저장 필드가 아니라 파생 값이며, 현재는 하위 도메인(챕터·씬) 부재로 0/기본값을 반환한다.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """camelCase 직렬화 + 속성 매핑 공통 베이스."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class WorkStats(_CamelModel):
    chapters: int = 0
    words: str = "0"
    words_unit: str = "천자"
    characters: int = 0
    progress: int = 0


class ReviewSummary(_CamelModel):
    scenes: int = 0
    states: int = 0
    conflicts: int = 0


class WorkCreate(_CamelModel):
    """작품 생성 입력 — 프론트 ``NewWorkInput``."""

    title: str = Field(min_length=1, max_length=255)
    genre: str = Field(min_length=1, max_length=64)
    keywords: list[str] = Field(default_factory=list)
    style: str = Field(min_length=1, max_length=64)


class WorkUpdate(_CamelModel):
    """작품 수정 입력 — 모든 필드 선택(PATCH)."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    short_label: str | None = Field(default=None, min_length=1, max_length=8)
    genre: str | None = Field(default=None, min_length=1, max_length=64)
    sub_genre: str | None = Field(default=None, max_length=64)
    keywords: list[str] | None = None
    style: str | None = Field(default=None, min_length=1, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    cover_theme: str | None = Field(default=None, max_length=16)


class WorkResponse(_CamelModel):
    """작품 응답 — 프론트 ``Work``의 비중첩 필드 + 파생(stats·reviewSummary·lastEditedLabel).

    중첩 컬렉션(chapters·entities·timeline·conflicts)은 각 도메인 엔드포인트 소관이라 제외한다.
    """

    id: uuid.UUID
    title: str
    short_label: str
    genre: str
    sub_genre: str
    keywords: list[str]
    style: str
    status: str
    cover_theme: str
    last_edited_label: str
    stats: WorkStats
    review_summary: ReviewSummary
