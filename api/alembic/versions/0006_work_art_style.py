"""works — 작품 화풍(art_style_id)·톤(art_style_note) 컬럼 추가.

Revision ID: 0006_work_art_style
Revises: 0005_entity_images
Create Date: 2026-08-13

[[작품 화풍]]을 작품 단위로 끌어올린다(ADR 260813-110724) — 화풍은 템플릿을 생성할
때마다 고르는 것이 아니라 작품이 소유한다. ``works``에 이미 문체를 뜻하는
``style`` 컬럼이 있어 혼동을 피하려 ``art_style_``로 접두한다.

두 컬럼 모두 nullable, 기본값 없음. **기존 작품에 화풍을 조용히 채우지 않는다** —
"작품의 화풍"이라는 개념을 도입하면서 몰래 기본값을 정해 버리면 그 개념이
무의미해진다(ADR). 그래서 백필 없음 — 기존 작품은 이 마이그레이션 이후에도 계속
``null``이고, 화풍은 별도 엔드포인트(추후 슬라이스)로만 채워진다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_work_art_style"
down_revision: str | None = "0005_entity_images"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("works", sa.Column("art_style_id", sa.String(length=32), nullable=True))
    op.add_column("works", sa.Column("art_style_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("works", "art_style_note")
    op.drop_column("works", "art_style_id")
