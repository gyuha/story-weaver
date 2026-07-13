"""chat domain — conversations.work_id (ADR-0010, plan.md work-chat-context S1).

Revision ID: 0010_conversation_work_id
Revises: 0009_llm_call_logs
Create Date: hand-authored for story-weaver-api

Adds ``conversations.work_id``: a nullable FK to ``works.id`` (ondelete=CASCADE,
indexed) so a conversation can be scoped to a work. No unique constraint on
``(user_id, work_id)`` — "start new conversation" must be able to create
additional rows for the same work; "current conversation" is defined as the
most recent one (see ``ChatRepository.get_latest_by_work``).

Autogenerate also picked up unrelated pre-existing drift (email_verifications/
password_resets/refresh_tokens unique-constraint vs. index, works column
server_defaults) — excluded from this migration since it's out of scope for
this task (same exclusion as 0009_llm_call_logs).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_conversation_work_id"
down_revision: str | None = "0009_llm_call_logs"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Add the nullable work_id FK column to conversations."""
    op.add_column("conversations", sa.Column("work_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_conversations_work_id"), "conversations", ["work_id"], unique=False)
    op.create_foreign_key(
        "fk_conversations_work_id_works",
        "conversations",
        "works",
        ["work_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Drop the work_id FK column from conversations."""
    op.drop_constraint("fk_conversations_work_id_works", "conversations", type_="foreignkey")
    op.drop_index(op.f("ix_conversations_work_id"), table_name="conversations")
    op.drop_column("conversations", "work_id")
