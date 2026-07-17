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

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

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

    def __repr__(self) -> str:
        return f"<Chapter id={self.id!r} title={self.title!r}>"
