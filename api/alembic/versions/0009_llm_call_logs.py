"""chat domain — llm_call_logs table (ADR-0009, plan.md llm-call-db-logging S1).

Revision ID: 0009_llm_call_logs
Revises: 0008_update_suggestions
Create Date: hand-authored for story-weaver-api

Creates ``llm_call_logs``: one row per LLM call (success or failure) across all
5 domains (assist/chat/dynamic_update/works/relationships), recorded at the
``LLMClient`` level. ``user_id`` is a bare UUID column (no FK) per the
cross-domain "reference by ID, not model import" rule. Retention (30 days) is
enforced by opportunistic DELETE on the insert path
(``domains.chat.repository.llm_call_log_repository``), not by this migration —
hence the index on ``created_at`` to support that deletion's WHERE clause.

Autogenerate also picked up unrelated pre-existing drift (email_verifications/
password_resets/refresh_tokens unique-constraint vs. index, works column
server_defaults) — excluded from this migration since it's out of scope for
this task.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0009_llm_call_logs"
down_revision: str | None = "0008_update_suggestions"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the llm_call_logs table."""
    op.create_table(
        "llm_call_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("correlation_id", sa.String(length=64), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("messages", postgresql.JSONB(), nullable=False),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_llm_call_logs_created_at"), "llm_call_logs", ["created_at"])


def downgrade() -> None:
    """Drop the llm_call_logs table."""
    op.drop_index(op.f("ix_llm_call_logs_created_at"), table_name="llm_call_logs")
    op.drop_table("llm_call_logs")
