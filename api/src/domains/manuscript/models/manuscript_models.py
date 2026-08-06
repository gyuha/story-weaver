"""원고 계층(시놉시스·부·챕터) ORM 모델.

작품(Work) 아래 원고 구조: 시놉시스(작품당 1) → 부(episodes) → 챕터(chapters)
(data-model.md 2장). 챕터가 본문(``body``)과 전역 순서(``global_seq``)를 직접 보유한다
(scenes 테이블은 폐지 — 챕터가 집필·AI 생성의 최소 단위로 흡수). 사용자 대면 명칭은
"부"이나 코드/DB 식별자는 `episodes` 유지(.forge/CONTEXT.md — write/집필 선례와 동일하게
용어-식별자 분리). 모든 테이블은 `work_id`로 직접 스코프되어 격리의 뿌리가 된다 — works
도메인의 ``Work`` 모델은 import하지 않고 ID로만 참조한다(도메인 간 직접 모델 import 금지).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class Synopsis(Base):
    """시놉시스 — 작품당 1개, 전체 줄거리 요약."""

    __tablename__ = "synopses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    def __repr__(self) -> str:
        return f"<Synopsis id={self.id!r} work_id={self.work_id!r}>"


class Episode(Base):
    """부(Part) — 코드/DB 식별자는 ``episodes`` 유지(.forge/CONTEXT.md 글로서리)."""

    __tablename__ = "episodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:
        return f"<Episode id={self.id!r} title={self.title!r}>"


class Chapter(Base):
    """챕터 — 부 아래, 집필·AI 생성의 최소 단위. 실제 원고 본문(``body``)을 보유한다.

    ``global_seq``는 작품 내 전역 단조 순서(타임라인 시점 비교 근거, data-model.md 2.1) —
    이 슬라이스에서는 챕터 생성 시 "작품 내 현재 최대값 + 1"로만 부여한다(재계산 최적화는 비목표).
    """

    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    global_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    #: 화별 줄거리 요약 — "이 화에서 무슨 일이 일어났는가" 서술. `검토 · 타임라인`
    #: 화면이 화 순서대로 모아 보여준다. 아직 요약하지 않은 화는 NULL이다.
    #: 엔티티 카드의 `entities.summary`(한 줄, 임베딩 대상)와 이름만 같고 다른 개념 —
    #: 이쪽은 임베딩하지 않는다.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Chapter id={self.id!r} title={self.title!r}>"


class ChapterVersion(Base):
    """화 버전 — 본문이 실린 화 PATCH 한 번마다 append되는 스냅샷(ADR 260805-214733).

    ``work_id``를 두지 않는다 — 소유권 검증은 항상 부모 화(``ManuscriptService.get_chapter``)를
    거치므로 하위 리소스에 별도 테넌트 컬럼이 불필요하다(plan.md 비고).

    ``created_at``은 ``func.now()``(다른 테이블들의 관례) 대신 ``func.clock_timestamp()``를
    쓴다 — 실측(그릴링 검증 노트): Postgres의 ``now()``는 트랜잭션 시작 시각이라 같은
    트랜잭션에서 버전이 둘 append되면 값이 같아져 ``(chapter_id, created_at DESC)`` 정렬이
    불안정해지지만, ``clock_timestamp()``는 문장 실행 시각이라 그러지 않는다(단, 초당
    수백~수천 회의 타이트 루프 삽입에서는 이론적으로 여전히 동률 가능 — 이 서비스는 화
    PATCH 하나당 버전 하나만 만들어 실 경로에서는 해당 없음).
    """

    __tablename__ = "chapter_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: 그 버전 시점의 화 요약(ADR — 요약도 버전에 함께 스냅샷). 요약만 갱신하는 PATCH는
    #: 새 버전을 만들지 않고 최신 버전의 이 컬럼만 갱신한다(최신 버전만 mutable).
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    __table_args__ = (
        Index("ix_chapter_versions_chapter_id_created_at", "chapter_id", created_at.desc()),
    )

    def __repr__(self) -> str:
        return f"<ChapterVersion id={self.id!r} chapter_id={self.chapter_id!r}>"
