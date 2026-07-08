"""World Bible domain — entities table (Entity Card).

Revision ID: 0005_worldbible_entities
Revises: 0004_manuscript_hierarchy
Create Date: hand-authored for story-weaver-api

Creates the `entities` table (data-model.md 3장): a single table for all four
entity_type variants (character/location/event/item) with type-specific fields
kept in `attributes` (JSONB, validated at the application level — no DB schema
for it, per data-model.md 3장's stated reason to avoid over-normalizing a field
set that may still change). `work_id` FK ondelete=CASCADE mirrors the manuscript
hierarchy migration: dropping a work drops its entities.

Autogenerate again picked up unrelated pre-existing drift on email_verifications/
password_resets/refresh_tokens (index vs. unique constraint) and works'
server_defaults — excluded here as out of scope for this migration, exactly as
0004_manuscript_hierarchy did.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_worldbible_entities"
down_revision: str | None = "0004_manuscript_hierarchy"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the entities table."""
    op.create_table(
        "entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "entity_type",
            sa.Enum("character", "location", "event", "item", name="entity_type"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "aliases",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_entities_work_id"), "entities", ["work_id"])


def downgrade() -> None:
    """Drop the entities table."""
    op.drop_index(op.f("ix_entities_work_id"), table_name="entities")
    op.drop_table("entities")
