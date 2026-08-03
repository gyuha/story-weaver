"""chapters.summary — 화별 줄거리 요약 컬럼 추가.

Revision ID: 0003_chapter_summary
Revises: 0002_purge_empty_embeddings
Create Date: 2026-08-03

집필 화면의 `요약` 기능이 생성한 "이 화에서 무슨 일이 일어났는가" 서술을 담는다.
`검토 · 타임라인` 화면이 이 값을 화 순서대로 모아 작품 전체 흐름을 한눈에 보여준다.

**nullable로 둔다** — 기존 화는 요약이 없고, "아직 요약하지 않은 화"와 "요약이 빈
화"를 구분할 이유가 없으며, 화면은 값이 없으면 `요약 없음`으로 표시한다. 기본값을
빈 문자열로 두면 그 구분이 사라지고 기존 행 전체를 UPDATE해야 한다.

엔티티 카드의 `entities.summary`(한 줄, 임베딩 대상)와 이름이 같지만 다른 개념이다 —
이쪽은 화 단위 서술이고 임베딩하지 않는다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_chapter_summary"
down_revision: str | None = "0002_purge_empty_embeddings"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("chapters", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("chapters", "summary")
