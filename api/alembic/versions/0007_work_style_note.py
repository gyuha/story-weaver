"""works — 문체 지침(style_note) 컬럼 추가.

Revision ID: 0007_work_style_note
Revises: 0006_work_art_style
Create Date: 2026-08-20

[[문체 지침]]을 작품 단위로 둔다(plan.md task 84 S1). ``works``에 이미 문체 라벨을
뜻하는 ``style`` 컬럼(간결체/만연체/서정체)이 있어 혼동을 피하려 ``style_note``로
구분한다 — ``art_style_note``와 같은 대칭 패턴이다.

컬럼은 nullable, 기본값 없음. **기존 작품에 조용히 채우지 않는다** — 새 개념을
도입하면서 몰래 기본값을 정하면 그 개념이 무의미해진다(ADR 260813-110724). 그래서
백필 없음 — 기존 작품은 이 마이그레이션 이후에도 계속 ``null``이고, 문체 지침은
시놉시스 화면에서만 채워진다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_work_style_note"
down_revision: str | None = "0006_work_art_style"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("works", sa.Column("style_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("works", "style_note")
