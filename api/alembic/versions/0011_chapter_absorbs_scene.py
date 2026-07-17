"""manuscript/timeline/dynamic_update/memory domains — chapter absorbs scene.

Revision ID: 0011_chapter_absorbs_scene
Revises: 0010_conversation_work_id
Create Date: hand-authored for story-weaver-api

Destructive schema change: the `scenes` table is dropped and `chapters` becomes the
minimum writing/AI-generation unit, gaining `body` (Text, NOT NULL) and `global_seq`
(Integer, NOT NULL — work-wide monotonic order, data-model.md 2.1). Every FK that
pointed at `scenes.id` is repointed at `chapters.id`:
`timeline_states.scene_id`, `scene_entity_links.scene_id`, `update_suggestions.scene_id`
all become `*.chapter_id` (`scene_entity_links`' UNIQUE constraint is renamed to
`uq_scene_entity_links_chapter_entity` to match). `embeddings.source_type`'s enum
value `'scene'` is renamed to `'chapter'` (`ALTER TYPE ... RENAME VALUE`, no data loss
there since `source_id` is a bare UUID with no FK).

Dev data reset is allowed for this slice (plan.md S1) — there is deliberately no
"merge multiple scenes into one chapter body" or "reassign scene_id" migration logic.
`TRUNCATE chapters CASCADE` wipes chapters and, transitively (existing ON DELETE
CASCADE FKs), scenes/timeline_states/scene_entity_links/update_suggestions before the
NOT NULL `body`/`global_seq` columns are added, so no backfill is needed. `embeddings`
has no FK to chapters (polymorphic `source_id`, ADR — see memory_models.py) so it is
left untouched; only the enum label is renamed.

Autogenerate again picked up unrelated pre-existing drift on email_verifications/
password_resets/refresh_tokens (index vs. unique constraint) and works' server_defaults
— excluded here as out of scope for this migration, exactly as 0004/0005/0006/0007/
0009/0010 did.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_chapter_absorbs_scene"
down_revision: str | None = "0010_conversation_work_id"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Drop scenes, add chapters.body/global_seq, repoint FKs, rename enum value."""
    # Dev reset: wipe chapters and everything that cascades from it (scenes,
    # timeline_states, scene_entity_links, update_suggestions) before adding the
    # new NOT NULL columns — no merge/backfill logic for this slice.
    op.execute("TRUNCATE TABLE chapters CASCADE")

    # Drop the FKs pointing at scenes first (Postgres refuses DROP TABLE while
    # other tables still reference it).
    op.drop_constraint(
        op.f("scene_entity_links_scene_id_fkey"), "scene_entity_links", type_="foreignkey"
    )
    op.drop_constraint(op.f("timeline_states_scene_id_fkey"), "timeline_states", type_="foreignkey")
    op.drop_constraint(
        op.f("update_suggestions_scene_id_fkey"), "update_suggestions", type_="foreignkey"
    )

    op.drop_index(op.f("ix_scenes_chapter_id"), table_name="scenes")
    op.drop_index(op.f("ix_scenes_work_id"), table_name="scenes")
    op.drop_table("scenes")

    op.add_column("chapters", sa.Column("body", sa.Text(), nullable=False))
    op.add_column("chapters", sa.Column("global_seq", sa.Integer(), nullable=False))

    # -- scene_entity_links: scene_id -> chapter_id -------------------------------
    op.drop_constraint("uq_scene_entity_links_scene_entity", "scene_entity_links", type_="unique")
    op.drop_index(op.f("ix_scene_entity_links_scene_id"), table_name="scene_entity_links")
    op.alter_column("scene_entity_links", "scene_id", new_column_name="chapter_id")
    op.create_index(op.f("ix_scene_entity_links_chapter_id"), "scene_entity_links", ["chapter_id"])
    op.create_foreign_key(
        op.f("scene_entity_links_chapter_id_fkey"),
        "scene_entity_links",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_scene_entity_links_chapter_entity",
        "scene_entity_links",
        ["chapter_id", "entity_id"],
    )

    # -- timeline_states: scene_id -> chapter_id ----------------------------------
    op.drop_index(op.f("ix_timeline_states_scene_id"), table_name="timeline_states")
    op.alter_column("timeline_states", "scene_id", new_column_name="chapter_id")
    op.create_index(op.f("ix_timeline_states_chapter_id"), "timeline_states", ["chapter_id"])
    op.create_foreign_key(
        op.f("timeline_states_chapter_id_fkey"),
        "timeline_states",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # -- update_suggestions: scene_id -> chapter_id -------------------------------
    op.drop_index(op.f("ix_update_suggestions_scene_id"), table_name="update_suggestions")
    op.alter_column("update_suggestions", "scene_id", new_column_name="chapter_id")
    op.create_index(op.f("ix_update_suggestions_chapter_id"), "update_suggestions", ["chapter_id"])
    op.create_foreign_key(
        op.f("update_suggestions_chapter_id_fkey"),
        "update_suggestions",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # -- embeddings.source_type enum: 'scene' -> 'chapter' ------------------------
    op.execute("ALTER TYPE embedding_source_type RENAME VALUE 'scene' TO 'chapter'")


def downgrade() -> None:
    """Reverse the schema shape (data already lost by the upgrade's TRUNCATE)."""
    op.execute("ALTER TYPE embedding_source_type RENAME VALUE 'chapter' TO 'scene'")

    op.drop_constraint(
        op.f("update_suggestions_chapter_id_fkey"), "update_suggestions", type_="foreignkey"
    )
    op.drop_index(op.f("ix_update_suggestions_chapter_id"), table_name="update_suggestions")
    op.alter_column("update_suggestions", "chapter_id", new_column_name="scene_id")
    op.create_index(op.f("ix_update_suggestions_scene_id"), "update_suggestions", ["scene_id"])

    op.drop_constraint(
        op.f("timeline_states_chapter_id_fkey"), "timeline_states", type_="foreignkey"
    )
    op.drop_index(op.f("ix_timeline_states_chapter_id"), table_name="timeline_states")
    op.alter_column("timeline_states", "chapter_id", new_column_name="scene_id")
    op.create_index(op.f("ix_timeline_states_scene_id"), "timeline_states", ["scene_id"])

    op.drop_constraint("uq_scene_entity_links_chapter_entity", "scene_entity_links", type_="unique")
    op.drop_constraint(
        op.f("scene_entity_links_chapter_id_fkey"), "scene_entity_links", type_="foreignkey"
    )
    op.drop_index(op.f("ix_scene_entity_links_chapter_id"), table_name="scene_entity_links")
    op.alter_column("scene_entity_links", "chapter_id", new_column_name="scene_id")
    op.create_index(op.f("ix_scene_entity_links_scene_id"), "scene_entity_links", ["scene_id"])

    op.drop_column("chapters", "global_seq")
    op.drop_column("chapters", "body")

    op.create_table(
        "scenes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("work_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
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

    op.create_foreign_key(
        op.f("scene_entity_links_scene_id_fkey"),
        "scene_entity_links",
        "scenes",
        ["scene_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_scene_entity_links_scene_entity", "scene_entity_links", ["scene_id", "entity_id"]
    )
    op.create_foreign_key(
        op.f("timeline_states_scene_id_fkey"),
        "timeline_states",
        "scenes",
        ["scene_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("update_suggestions_scene_id_fkey"),
        "update_suggestions",
        "scenes",
        ["scene_id"],
        ["id"],
        ondelete="CASCADE",
    )
