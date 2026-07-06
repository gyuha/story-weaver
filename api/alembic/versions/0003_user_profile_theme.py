"""Auth domain — user profile theme columns.

Revision ID: 0003_user_profile_theme
Revises: 0002_works
Create Date: hand-authored for story-weaver-api

Adds `avatar_emoji` and `theme` to `users` so profile/theme preferences
persist server-side per user, analogous to how ADR-0004 persists the
LLM quality tier per user rather than per client/local-storage.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_user_profile_theme"
down_revision: str | None = "0002_works"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Add avatar_emoji and theme columns to users."""
    op.add_column("users", sa.Column("avatar_emoji", sa.String(length=32), nullable=True))
    op.add_column(
        "users",
        sa.Column("theme", sa.String(length=16), nullable=False, server_default="system"),
    )


def downgrade() -> None:
    """Drop theme and avatar_emoji columns from users."""
    op.drop_column("users", "theme")
    op.drop_column("users", "avatar_emoji")
