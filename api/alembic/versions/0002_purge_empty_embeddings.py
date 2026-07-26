"""purge empty-content embeddings — 잔존 빈 임베딩 행 정리.

Revision ID: 0002_purge_empty_embeddings
Revises: 0001_initial_schema
Create Date: 2026-07-26

`_chunk_paragraphs`가 빈 본문에 `[""]`를 반환하던 버그로 인해 빈 화가 생성될 때마다
`content = ''`인 무의미한 임베딩 행이 쌓였다(memory ANN top-5 후보를 낭비). 재발은
서비스 코드 수정으로 막혔으므로 이 마이그레이션은 기존에 쌓인 행을 지우는 1회성
데이터 정리이며, 스키마 변경은 없다.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_purge_empty_embeddings"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """content가 빈 문자열인 embeddings 행을 삭제한다."""
    op.execute("DELETE FROM embeddings WHERE content = ''")


def downgrade() -> None:
    # no-op: 삭제 대상은 빈 문자열 임베딩(의미 없는 데이터)이므로 복원할 값이 없다.
    pass
