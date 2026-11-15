"""F1 (round 3) — root scenes must keep a valid `story_order`.

`_renumber_scene_story_order` computes `chapter.story_order + i` for the scene
children of a parent. When the parent is NULL (a root scene) the base lookup
`SELECT story_order FROM outline_node WHERE id = NULL` matches no row, so the
base is NULL and `NULL + i` NULLs every root scene's `story_order` — the scene
falls off the reading axis entirely (NULL matches no `story_order < $3` prior
filter, sorts last, and the FE's story_order-first sort loses it).

These are DB tests, not mocks: the failure mode is a SQL NULL-propagation.
"""

from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

from app.db.migrate import run_migrations
from app.db.repositories.outline import OutlineRepo
from app.engine.chapter_gen import STORY_ORDER_CHAPTER_STRIDE as S

_DSN = os.environ.get("TEST_COMPOSITION_DB_URL")

pytestmark = [
    pytest.mark.skipif(not _DSN, reason="set TEST_COMPOSITION_DB_URL to a throwaway DB to run"),
    pytest.mark.xdist_group("pg"),
]


@pytest.fixture
async def pool():
    p = await asyncpg.create_pool(_DSN, min_size=1, max_size=4)
    await run_migrations(p)
    yield p
    await p.close()


async def _work(pool, project, book, user):
    async with pool.acquire() as c:
        await c.execute(
            "INSERT INTO composition_work (project_id, book_id, created_by) VALUES ($1,$2,$3)",
            project, book, user,
        )


def _chapter(chapter_id, title, sort, n_scenes):
    return {
        "chapter_id": chapter_id, "title": title, "intent": "", "story_order": sort * S,
        "scenes": [
            {"title": f"{title}{i}", "synopsis": "", "story_order": sort * S + i}
            for i in range(n_scenes)
        ],
    }


async def test_root_scenes_created_at_top_level_keep_their_chapter_slot(pool):
    """A scene created with parent_id=None still belongs to a chapter (the DB
    CHECK requires chapter_id on a scene). Its reading position is that
    chapter's slot plus its index among the chapter's root scenes — never NULL."""
    repo = OutlineRepo(pool)
    project, book, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    ch = uuid.uuid4()
    await _work(pool, project, book, user)
    await repo.commit_decomposed_tree(
        project, book_id=book, created_by=user, arc_title="Arc",
        chapters=[_chapter(ch, "s", 5, 0)],  # book chapter 5, no scenes under it yet
    )

    first = await repo.create_node(
        project, created_by=user, kind="scene", parent_id=None,
        chapter_id=ch, title="r0",
    )
    second = await repo.create_node(
        project, created_by=user, kind="scene", parent_id=None,
        chapter_id=ch, title="r1",
    )

    assert first.story_order == 5 * S, f"root scene lost its chapter slot: {first.story_order!r}"
    assert second.story_order == 5 * S + 1, f"second root scene: {second.story_order!r}"


async def test_scene_dragged_to_root_keeps_a_valid_story_order(pool):
    """The reorder path renumbers the destination parent too. Dragging a scene
    out of its chapter to the top level must not NULL its story_order: it keeps
    its chapter's slot plus its index among that chapter's root scenes."""
    repo = OutlineRepo(pool)
    project, book, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    ch = uuid.uuid4()
    await _work(pool, project, book, user)
    res = await repo.commit_decomposed_tree(
        project, book_id=book, created_by=user, arc_title="Arc",
        chapters=[_chapter(ch, "s", 5, 2)],  # scenes at 5000, 5001
    )
    scenes = res["scene_ids"]

    moved = await repo.reorder_node(scenes[1], new_parent_id=None, after_id=None)

    assert moved is not None
    assert moved.story_order == 5 * S, (
        f"scene dragged to root lost its reading position: {moved.story_order!r}")
    async with pool.acquire() as c:
        remaining = await c.fetchval(
            "SELECT story_order FROM outline_node WHERE id=$1", scenes[0])
    assert remaining == 5 * S, "the scene left behind keeps its slot"
