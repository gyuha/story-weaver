"""설정 이미지(EntityImage) ORM 모델.

재생성은 덮어쓰지 않고 append한다 — 한 엔티티 카드가 여러 장의 설정 이미지를 쌓고,
그 중 한 장을 [[대표 이미지]](``is_primary``)로 지정한다(카드당 최대 1장 — 부분 유니크
인덱스로 마이그레이션에서 강제).

``visual_description``을 엔티티 ``attributes``가 아니라 여기 두는 것이 ADR
`260811-234512`의 핵심이다: `worldbible_service.py`의 `_entity_content()`가
`attributes` JSONB 전체를 `json.dumps`해 임베딩 텍스트로 쓰므로, 시각 묘사를
`attributes`에 넣으면 [[메모리]] 컨텍스트가 외형 서술로 오염된다. 이미지 행에 두면
그 오염이 구조적으로 불가능해진다.

worldbible 도메인의 ``Entity`` 모델은 import하지 않는다(도메인 간 직접 모델 import
금지) — ``entity_id``로만 참조하고, DB 레벨 FK(ondelete CASCADE)는 마이그레이션에 둔다.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base


class EntityImage(Base):
    """설정 이미지 — 엔티티 카드에 append되는 생성 이미지 1장."""

    __tablename__ = "entity_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    extra_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    final_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    #: 비전 역번역 결과(ADR 260811-234512). 생성 직후 이미지가 먼저 커밋되고 이 컬럼은
    #: 뒤늦게 채워지므로 nullable — null이면 아직 묘사가 없거나 묘사 단계가 실패한 것.
    visual_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<EntityImage id={self.id!r} entity_id={self.entity_id!r} "
            f"is_primary={self.is_primary!r}>"
        )
