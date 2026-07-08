"""업데이트 제안 ORM 모델 (plan.md M3-S2).

씬 추출(S1) 결과를 기존 엔티티와 매칭한 뒤 노이즈가 아닌 항목을 작가 검토용으로
저장하는 테이블. ``kind``별로 ``payload`` JSONB 모양이 다르다(new_entity: name/summary,
attribute_change: entityId/attribute/newValue, timeline_state: entityId/stateKey/
stateValue — dynamic_update_schemas.py의 CandidateEntity/AttributeChange/TimelineChange와
동일 키). works/scenes 테이블은 FK로만 참조하고 해당 ORM 모델은 import하지 않는다
(도메인 간 직접 모델 import 금지).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class SuggestionKind(enum.StrEnum):
    """제안 종류 (plan.md M3-S2)."""

    new_entity = "new_entity"
    attribute_change = "attribute_change"
    timeline_state = "timeline_state"


class SuggestionStatus(enum.StrEnum):
    """제안 검토 상태."""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class UpdateSuggestion(Base):
    """업데이트 제안 — 씬에서 감지된 신규 설정 후보 1건(작가 승인 대기)."""

    __tablename__ = "update_suggestions"

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
    kind: Mapped[SuggestionKind] = mapped_column(
        SAEnum(SuggestionKind, name="update_suggestion_kind"), nullable=False
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[SuggestionStatus] = mapped_column(
        SAEnum(SuggestionStatus, name="update_suggestion_status"),
        nullable=False,
        default=SuggestionStatus.pending,
        server_default=SuggestionStatus.pending.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<UpdateSuggestion id={self.id!r} kind={self.kind!r} status={self.status!r}>"
