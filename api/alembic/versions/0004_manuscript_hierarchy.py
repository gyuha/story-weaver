"""Manuscript domain — synopses/episodes/chapters/scenes hierarchy.

Revision ID: 0004_manuscript_hierarchy
Revises: 0003_user_profile_theme
Create Date: hand-authored for story-weaver-api

Creates the manuscript hierarchy under a work (data-model.md 2장):
synopses(1:1 per work) -> episodes(부) -> chapters -> scenes(body 보유, global_seq 포함).
Every table carries its own `work_id` FK (denormalized ownership key, ADR-0005) so
isolation checks stay a single work_id-scoped WHERE, matching the works domain pattern.
FK ondelete=CASCADE mirrors the hierarchy: dropping a work drops everything beneath it,
dropping an episode drops its chapters (and, transitively, their scenes).

Autogenerate also picked up unrelated pre-existing drift on email_verifications/
password_resets/refresh_tokens (index vs. unique constraint) and works' server_defaults
— excluded here as out of scope for this migration.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_manuscript_hierarchy"
down_revision: str | None = "0003_user_profile_theme"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create synopses, episodes, chapters, scenes tables."""
    op.create_table(
        "synopses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("work_id"),
    )

    op.create_table(
        "episodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_episodes_work_id"), "episodes", ["work_id"])

    op.create_table(
        "chapters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("episode_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chapters_work_id"), "chapters", ["work_id"])
    op.create_index(op.f("ix_chapters_episode_id"), "chapters", ["episode_id"])

    op.create_table(
        "scenes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("global_seq", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scenes_work_id"), "scenes", ["work_id"])
    op.create_index(op.f("ix_scenes_chapter_id"), "scenes", ["chapter_id"])


def downgrade() -> None:
    """Drop scenes, chapters, episodes, synopses tables (reverse dependency order)."""
    op.drop_index(op.f("ix_scenes_chapter_id"), table_name="scenes")
    op.drop_index(op.f("ix_scenes_work_id"), table_name="scenes")
    op.drop_table("scenes")

    op.drop_index(op.f("ix_chapters_episode_id"), table_name="chapters")
    op.drop_index(op.f("ix_chapters_work_id"), table_name="chapters")
    op.drop_table("chapters")

    op.drop_index(op.f("ix_episodes_work_id"), table_name="episodes")
    op.drop_table("episodes")

    op.drop_table("synopses")
