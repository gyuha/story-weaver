"""작품(Work) ORM 모델.

소유 루트는 ``users``(ADR-0005). 모든 하위 도메인 테이블은 ``work_id``로 이 행에
귀속되어 멀티테넌시 격리의 뿌리가 된다. 필드는 프론트 목업 ``Work`` 타입
(``web/src/features/shared/types.ts``)에 맞춘다 — 파생 필드(stats·reviewSummary·
lastEditedLabel)는 저장하지 않고 응답에서 계산한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class Work(Base):
    """작품 — 한 작가(user)의 소설 프로젝트. 최상위 소유 단위."""

    __tablename__ = "works"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_label: Mapped[str] = mapped_column(String(8), nullable=False)
    genre: Mapped[str] = mapped_column(String(64), nullable=False)
    sub_genre: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    keywords: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list, server_default="{}"
    )
    style: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="구상")
    cover_theme: Mapped[str] = mapped_column(String(16), nullable=False, default="dark")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Work id={self.id!r} title={self.title!r}>"
