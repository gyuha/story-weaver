"""dynamic_update domain — update_suggestions table.

Revision ID: 0008_update_suggestions
Revises: 0007_memory_embeddings
Create Date: hand-authored for story-weaver-api

Creates ``update_suggestions`` (plan.md M3-S2): a per-scene queue of author-review
candidates produced by matching extraction (S1) results against existing entities.
``kind`` discriminates the ``payload`` JSONB shape (new_entity / attribute_change /
timeline_state — see dynamic_update_schemas.py). FK columns reference `works.id`/
`scenes.id` by table name only (no ORM model import), mirroring 0005/0006.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0008_update_suggestions"
down_revision: str | None = "0007_memory_embeddings"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the update_suggestions table."""
    op.create_table(
        "update_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "new_entity",
                "attribute_change",
                "timeline_state",
                name="update_suggestion_kind",
            ),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="update_suggestion_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_update_suggestions_work_id"), "update_suggestions", ["work_id"])
    op.create_index(op.f("ix_update_suggestions_scene_id"), "update_suggestions", ["scene_id"])


def downgrade() -> None:
    """Drop the update_suggestions table."""
    op.drop_index(op.f("ix_update_suggestions_scene_id"), table_name="update_suggestions")
    op.drop_index(op.f("ix_update_suggestions_work_id"), table_name="update_suggestions")
    op.drop_table("update_suggestions")
