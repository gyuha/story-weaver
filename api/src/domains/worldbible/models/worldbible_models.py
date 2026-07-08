"""World Bible 엔티티 카드 ORM 모델 (data-model.md 3장).

엔티티 카드는 인물·장소·사건·아이템 중 하나(``entity_type`` 판별 컬럼)를 표현하는
공통 테이블이다. 타입별 필드는 별도 테이블로 정규화하지 않고 ``attributes``(JSONB)에
담는다(과한 정규화 회피 — data-model.md 3장). works 도메인의 ``Work`` 모델은 import하지
않고 ``work_id``로만 참조한다(도메인 간 직접 모델 import 금지). ``created_at``/
``updated_at``은 manuscript 도메인의 ``Scene`` 타임스탬프 컬럼과 동일하게 둔다.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class EntityType(enum.StrEnum):
    """엔티티 카드 판별 타입 (data-model.md 3.1)."""

    character = "character"
    location = "location"
    event = "event"
    item = "item"


class Entity(Base):
    """엔티티 카드 — World Bible의 한 항목(인물·장소·사건·아이템)."""

    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type: Mapped[EntityType] = mapped_column(
        SAEnum(EntityType, name="entity_type"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list, server_default="{}"
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Entity id={self.id!r} entity_type={self.entity_type!r} name={self.name!r}>"
