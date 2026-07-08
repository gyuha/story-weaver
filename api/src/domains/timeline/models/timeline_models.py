"""타임라인 상태·씬-엔티티 링크 ORM 모델 (data-model.md 4·5장).

두 테이블 모두 ``work_id``로 격리되고(ADR-0005), ``entity_id``/``scene_id``로 worldbible의
``Entity``·manuscript의 ``Scene``을 참조한다 — FK는 테이블명 문자열로만 선언하고 해당
ORM 모델은 import하지 않는다(도메인 간 직접 모델 import 금지 — works를 참조하는 기존
도메인들과 동일 패턴). ``created_at``만 두고 ``updated_at``은 두지 않는다: 두 테이블 모두
"시점에 묶인 불변 사실의 누적"이라 행 자체가 수정되지 않는다(data-model.md 4장).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class TimelineStateSource(enum.StrEnum):
    """타임라인 상태 출처 (data-model.md 4.1). 이 슬라이스는 ``author``만 기록한다."""

    author = "author"
    ai_suggested = "ai_suggested"


class SceneEntityLinkSource(enum.StrEnum):
    """씬-엔티티 링크 출처 (data-model.md 5.1). 이 슬라이스는 ``author``만 기록한다."""

    author = "author"
    ai_extracted = "ai_extracted"


class TimelineState(Base):
    """타임라인 상태 — 한 엔티티가 특정 시점(씬)에 갖는 상태 1행."""

    __tablename__ = "timeline_states"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scene_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state_key: Mapped[str] = mapped_column(String(255), nullable=False)
    state_value: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[TimelineStateSource] = mapped_column(
        SAEnum(TimelineStateSource, name="timeline_state_source"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<TimelineState id={self.id!r} entity_id={self.entity_id!r} "
            f"state_key={self.state_key!r}>"
        )


class SceneEntityLink(Base):
    """씬-엔티티 링크 — 특정 씬에 특정 엔티티가 등장함을 표시하는 다대다 연결."""

    __tablename__ = "scene_entity_links"
    __table_args__ = (
        UniqueConstraint("scene_id", "entity_id", name="uq_scene_entity_links_scene_entity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scene_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[SceneEntityLinkSource] = mapped_column(
        SAEnum(SceneEntityLinkSource, name="scene_entity_link_source"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<SceneEntityLink id={self.id!r} scene_id={self.scene_id!r} "
            f"entity_id={self.entity_id!r}>"
        )
