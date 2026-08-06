"""chapter_versions — 화 버전 기록 테이블 생성 + 기존 화 본문 백필.

Revision ID: 0004_chapter_versions
Revises: 0003_chapter_summary
Create Date: 2026-08-05

`ManuscriptService.update_chapter`의 본문 PATCH 한 번마다 append되는 스냅샷을 담는다
(ADR 260805-214733). ``work_id``를 두지 않는다 — 소유권 검증이 항상 부모 화를 거치므로
불필요하다.

``created_at``은 ``now()``(트랜잭션 시작 시각) 대신 ``clock_timestamp()``(문장 실행
시각)를 쓴다 — 실측: 같은 트랜잭션에서 두 INSERT가 일어나면 ``now()``는 같은 값을
반환해 ``(chapter_id, created_at DESC)`` 정렬이 불안정해지지만 ``clock_timestamp()``는
그러지 않는다.

**백필**: 본문이 있는(``body <> ''``) 기존 화마다 현재 본문·요약을 초기 버전 1개로
복사한다 — 백필하지 않으면 이미 써 둔 화에서 늘려쓰기가 본문을 대체하고 저장하는 순간
대체 전 원고가 어디에도 남지 않는다(ADR Consequences). ``chapters``에 타임스탬프가
없어 백필 항목의 ``created_at``은 실제 저장 시각이 아니라 이 마이그레이션 실행
시각이다 — 되돌릴 수 없는 근사지만, 정확한 시각보다 도입 지점의 원고 보존을
택한 의도된 절충이다(ADR Consequences).

``gen_random_uuid()``는 PostgreSQL 13+ 코어 내장 함수라 별도 익스텐션 없이 쓸 수
있다(이 배포의 PG16에서 실측 확인).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_chapter_versions"
down_revision: str | None = "0003_chapter_summary"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "chapter_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_chapter_versions_chapter_id"), "chapter_versions", ["chapter_id"], unique=False
    )
    op.execute(
        "CREATE INDEX ix_chapter_versions_chapter_id_created_at "
        "ON chapter_versions (chapter_id, created_at DESC)"
    )

    op.execute(
        "INSERT INTO chapter_versions (id, chapter_id, body, summary, created_at) "
        "SELECT gen_random_uuid(), id, body, summary, clock_timestamp() "
        "FROM chapters WHERE body <> ''"
    )


def downgrade() -> None:
    op.drop_table("chapter_versions")
