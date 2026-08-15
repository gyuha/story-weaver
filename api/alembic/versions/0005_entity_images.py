"""entity_images — 설정 이미지 테이블 생성.

Revision ID: 0005_entity_images
Revises: 0004_chapter_versions
Create Date: 2026-08-11

[[설정 이미지]]를 append-only로 담는다(ADR 260811-234511) — 재생성은 덮어쓰지
않고 새 행을 추가한다. ``visual_description``을 이 테이블에 두고 ``entities.attributes``
에 넣지 않는 이유는 ADR 260811-234512 — `worldbible_service.py`의 `_entity_content()`가
`attributes` 전체를 임베딩하므로, 시각 묘사를 거기 넣으면 [[메모리]] 컨텍스트가
오염된다.

``entity_id``는 ``entities.id``에 FK(ondelete CASCADE)를 걸지만, worldbible 도메인의
``Entity`` ORM 모델은 import하지 않는다(도메인 간 직접 모델 import 금지) — DB 레벨
제약만 여기 둔다.

카드당 [[대표 이미지]]는 최대 1장이므로 부분 유니크 인덱스로 강제한다:
``is_primary``가 true인 행이 같은 ``entity_id``에 둘 이상 있으면 INSERT/UPDATE가
실패한다.

백필 없음 — 기존 카드에 이미지가 없으므로 이관할 데이터가 없다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_entity_images"
down_revision: str | None = "0004_chapter_versions"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "entity_images",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("work_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("template_id", sa.String(length=64), nullable=False),
        sa.Column("extra_prompt", sa.Text(), nullable=False),
        sa.Column("final_prompt", sa.Text(), nullable=False),
        sa.Column("visual_description", sa.Text(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_entity_images_work_id"), "entity_images", ["work_id"], unique=False)
    op.create_index(
        op.f("ix_entity_images_entity_id"), "entity_images", ["entity_id"], unique=False
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_entity_images_primary ON entity_images (entity_id) WHERE is_primary"
    )


def downgrade() -> None:
    op.drop_table("entity_images")
