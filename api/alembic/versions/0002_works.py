"""Works domain — works table.

Revision ID: 0002_works
Revises: 0001_initial_schema
Create Date: hand-authored for story-weaver-api

Creates the `works` table — 작품(Work), the ownership root for all later domains
(ADR-0005: tenant root = users). Every future domain table will reference
`works.id` via `work_id`.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_works"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the works table."""
    op.create_table(
        "works",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("short_label", sa.String(length=8), nullable=False),
        sa.Column("genre", sa.String(length=64), nullable=False),
        sa.Column("sub_genre", sa.String(length=64), nullable=False, server_default=""),
        sa.Column(
            "keywords",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("style", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="구상"),
        sa.Column("cover_theme", sa.String(length=16), nullable=False, server_default="dark"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_works_user_id"), "works", ["user_id"])


def downgrade() -> None:
    """Drop the works table."""
    op.drop_index(op.f("ix_works_user_id"), table_name="works")
    op.drop_table("works")
