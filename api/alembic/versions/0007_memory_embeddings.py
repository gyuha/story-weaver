"""memory domain — pgvector extension and embeddings table.

Revision ID: 0007_memory_embeddings
Revises: 0006_timeline_states_links
Create Date: hand-authored for story-weaver-api

Creates the `embeddings` table (data-model.md 6장): a polymorphic vector store for
entity-card and scene-body chunks, isolated by `work_id` (ADR-0005). `source_type`
(entity/scene) + `source_id` identify the owning row in worldbible/manuscript without
an FK — a single FK can't target two different tables, and cross-domain ORM model
imports are disallowed anyway (same convention as existing domains referencing
`works.id` by table name only). Embedding dimension is fixed at 384, matching the
local `paraphrase-multilingual-MiniLM-L12-v2` model's output (human infra decision —
see plan.md; the active chat LLM provider, z.ai, does not support an embeddings
endpoint, so no external embedding API is involved here). Requires the `vector`
extension (pgvector/pgvector:pg16 image), created here since autogenerate does not
emit extension DDL on its own.

Autogenerate again picked up unrelated pre-existing drift on email_verifications/
password_resets/refresh_tokens (index vs. unique constraint) and works' server_defaults
— excluded here as out of scope for this migration, exactly as 0004/0005/0006 did.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_memory_embeddings"
down_revision: str | None = "0006_timeline_states_links"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Enable pgvector and create the embeddings table."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "source_type",
            sa.Enum("entity", "scene", name="embedding_source_type"),
            nullable=False,
        ),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_embeddings_work_id"), "embeddings", ["work_id"])
    op.create_index(op.f("ix_embeddings_source_id"), "embeddings", ["source_id"])


def downgrade() -> None:
    """Drop the embeddings table (leaves the vector extension installed)."""
    op.drop_index(op.f("ix_embeddings_source_id"), table_name="embeddings")
    op.drop_index(op.f("ix_embeddings_work_id"), table_name="embeddings")
    op.drop_table("embeddings")
