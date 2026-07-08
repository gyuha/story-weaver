"""timeline domain — timeline_states and scene_entity_links tables.

Revision ID: 0006_timeline_states_links
Revises: 0005_worldbible_entities
Create Date: hand-authored for story-weaver-api

Creates the "상태/링크" axis (data-model.md 4·5장): `timeline_states` (a per-scene,
per-entity fact — "entity E had state S as of scene X", append-only, no updated_at)
and `scene_entity_links` (which entities appear in which scene, UNIQUE(scene_id,
entity_id) so the same pair can't be linked twice). Both tables live in the new
`timeline` domain rather than `manuscript` or `worldbible` because they reference
*both* `scenes` and `entities` — no matter which of those two domains hosted them,
the other reference would still cross a domain boundary. FK columns reference
`scenes.id`/`entities.id` by table name only (no ORM model import), mirroring how
existing domains already reference `works.id` without importing the Work model.

Autogenerate again picked up unrelated pre-existing drift on email_verifications/
password_resets/refresh_tokens (index vs. unique constraint) and works' server_defaults
— excluded here as out of scope for this migration, exactly as 0004/0005 did.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_timeline_states_links"
down_revision: str | None = "0005_worldbible_entities"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the timeline_states and scene_entity_links tables."""
    op.create_table(
        "timeline_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state_key", sa.String(length=255), nullable=False),
        sa.Column("state_value", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.Enum("author", "ai_suggested", name="timeline_state_source"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_timeline_states_work_id"), "timeline_states", ["work_id"])
    op.create_index(op.f("ix_timeline_states_entity_id"), "timeline_states", ["entity_id"])
    op.create_index(op.f("ix_timeline_states_scene_id"), "timeline_states", ["scene_id"])

    op.create_table(
        "scene_entity_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "source",
            sa.Enum("author", "ai_extracted", name="scene_entity_link_source"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scene_id", "entity_id", name="uq_scene_entity_links_scene_entity"),
    )
    op.create_index(op.f("ix_scene_entity_links_work_id"), "scene_entity_links", ["work_id"])
    op.create_index(op.f("ix_scene_entity_links_scene_id"), "scene_entity_links", ["scene_id"])
    op.create_index(op.f("ix_scene_entity_links_entity_id"), "scene_entity_links", ["entity_id"])


def downgrade() -> None:
    """Drop scene_entity_links and timeline_states tables."""
    op.drop_index(op.f("ix_scene_entity_links_entity_id"), table_name="scene_entity_links")
    op.drop_index(op.f("ix_scene_entity_links_scene_id"), table_name="scene_entity_links")
    op.drop_index(op.f("ix_scene_entity_links_work_id"), table_name="scene_entity_links")
    op.drop_table("scene_entity_links")

    op.drop_index(op.f("ix_timeline_states_scene_id"), table_name="timeline_states")
    op.drop_index(op.f("ix_timeline_states_entity_id"), table_name="timeline_states")
    op.drop_index(op.f("ix_timeline_states_work_id"), table_name="timeline_states")
    op.drop_table("timeline_states")
