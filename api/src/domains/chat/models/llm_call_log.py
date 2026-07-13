"""LLM 호출 로그 ORM 모델 (ADR-0009 — llm_call_logs 30일 보관).

``LLMClient.astream``/``ainvoke`` 레벨에서 5개 도메인(assist·chat·dynamic_update·
works·relationships)의 모든 LLM 호출 입력·출력·실패를 기록해 SQL로 호출 단위
조회·디버깅이 가능하게 한다. 보존 기한(30일) 삭제는
``domains.chat.repository.llm_call_log_repository``의 기회적 삭제가 담당한다.
``user_id``는 도메인 간 직접 모델 import 금지 컨벤션에 따라 FK 없이 ID만 보관한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class LLMCallLog(Base):
    """LLM 호출 1건(성공 또는 실패)의 입력·출력 전문 기록."""

    __tablename__ = "llm_call_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    task: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<LLMCallLog id={self.id!r} task={self.task!r} model={self.model!r}>"
