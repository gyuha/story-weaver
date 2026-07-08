"""임베딩 ORM 모델 (data-model.md 6장).

엔티티 카드·씬 본문을 임베딩한 벡터를 저장하는 폴리모픽 테이블 — ``source_type``
(entity/scene) + ``source_id``로 worldbible의 ``Entity`` 또는 manuscript의 ``Scene``을
가리킨다. 두 도메인 중 어느 쪽 테이블도 FK로 잡지 않는다(폴리모픽 참조라 단일 FK가
불가능하고, 애초에 도메인 간 직접 모델 import 금지 컨벤션과도 맞음) — 격리·정리는
``work_id`` FK(CASCADE)만으로 충분하다. 임베딩 차원(384)은 로컬
``paraphrase-multilingual-MiniLM-L12-v2`` 모델의 출력 차원으로 고정(인간 결정,
plan.md 참조) — S2에서 이 클라이언트를 붙인다.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from core.database import Base

EMBEDDING_DIM = 384


class EmbeddingSourceType(enum.StrEnum):
    """임베딩 출처 판별 타입 (data-model.md 6장)."""

    entity = "entity"
    scene = "scene"


class Embedding(Base):
    """임베딩 — 엔티티 카드 또는 씬 본문 1개 청크의 벡터 표현."""

    __tablename__ = "embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type: Mapped[EmbeddingSourceType] = mapped_column(
        SAEnum(EmbeddingSourceType, name="embedding_source_type"), nullable=False
    )
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<Embedding id={self.id!r} source_type={self.source_type!r} "
            f"source_id={self.source_id!r} chunk_index={self.chunk_index!r}>"
        )
