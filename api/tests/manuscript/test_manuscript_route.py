"""부(episode)·챕터·씬 HTTP 라우트 — 실 DB + 실 라우터 경로.

works 도메인의 ``test_works_isolation.py`` 패턴(실 DB, `get_current_user`만 override)을
따른다. CRUD 계약(camelCase, 상태 코드), DB 레벨 cascade 삭제, 작품 전역 `global_seq`
단조 증가, 교차 테넌트 404를 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.models import Chapter, Scene
from domains.manuscript.router import router
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@manuscript.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@manuscript.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def owner_work(two_users: tuple[User, User]) -> Work:
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()
        return work


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _create_episode(
    app: FastAPI, owner: User, work_id: uuid.UUID, title: str = "1부", order_index: int = 0
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes",
            json={"title": title, "orderIndex": order_index},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_chapter(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    title: str = "1장",
    order_index: int = 0,
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters",
            json={"title": title, "orderIndex": order_index},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_scene(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    order_index: int = 0,
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters/{chapter_id}/scenes",
            json={"orderIndex": order_index, "body": "본문"},
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Episode CRUD
# ---------------------------------------------------------------------------


async def test_create_episode_returns_201_with_camelcase(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    body = await _create_episode(app, owner, owner_work.id, title="1부", order_index=0)
    assert body["title"] == "1부"
    assert body["orderIndex"] == 0
    assert body["workId"] == str(owner_work.id)


async def test_list_episodes_returns_created(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    await _create_episode(app, owner, owner_work.id, title="1부")

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/episodes")
    assert resp.status_code == 200
    titles = [e["title"] for e in resp.json()]
    assert titles == ["1부"]


async def test_update_episode(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id, title="1부")

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode['id']}",
            json={"title": "개정 1부"},
        )
    assert resp.status_code == 200
    assert resp.json()["title"] == "개정 1부"


async def test_get_episode_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    episode = await _create_episode(app, owner, owner_work.id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/episodes/{episode['id']}")
    assert resp.status_code == 404


async def test_delete_episode_cascades_chapters_and_scenes(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    chapter = await _create_chapter(app, owner, owner_work.id, uuid.UUID(str(episode["id"])))
    scene = await _create_scene(
        app, owner, owner_work.id, uuid.UUID(str(episode["id"])), uuid.UUID(str(chapter["id"]))
    )

    async with _client_as(app, owner) as client:
        resp = await client.delete(f"/api/v1/works/{owner_work.id}/episodes/{episode['id']}")
    assert resp.status_code == 204

    async with AsyncSessionFactory() as session:
        chapter_row = await session.execute(
            select(Chapter).where(Chapter.id == uuid.UUID(str(chapter["id"])))
        )
        assert chapter_row.scalar_one_or_none() is None
        scene_row = await session.execute(
            select(Scene).where(Scene.id == uuid.UUID(str(scene["id"])))
        )
        assert scene_row.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Chapter CRUD
# ---------------------------------------------------------------------------


async def test_create_list_update_chapter(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    chapter = await _create_chapter(app, owner, owner_work.id, episode_id, title="1장")
    assert chapter["episodeId"] == str(episode_id)

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters")
    assert resp.status_code == 200
    assert [c["title"] for c in resp.json()] == ["1장"]

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter['id']}",
            json={"title": "개정 1장"},
        )
    assert resp.status_code == 200
    assert resp.json()["title"] == "개정 1장"


async def test_delete_chapter_cascades_scenes(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    chapter = await _create_chapter(app, owner, owner_work.id, episode_id)
    chapter_id = uuid.UUID(str(chapter["id"]))
    scene = await _create_scene(app, owner, owner_work.id, episode_id, chapter_id)
    scene_id = uuid.UUID(str(scene["id"]))

    async with _client_as(app, owner) as client:
        resp = await client.delete(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter_id}"
        )
    assert resp.status_code == 204

    async with AsyncSessionFactory() as session:
        scene_row = await session.execute(select(Scene).where(Scene.id == scene_id))
        assert scene_row.scalar_one_or_none() is None


async def test_get_chapter_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    chapter = await _create_chapter(app, owner, owner_work.id, episode_id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter['id']}"
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Scene CRUD + global_seq
# ---------------------------------------------------------------------------


async def test_create_list_update_delete_scene(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    chapter = await _create_chapter(app, owner, owner_work.id, episode_id)
    chapter_id = uuid.UUID(str(chapter["id"]))
    scene = await _create_scene(app, owner, owner_work.id, episode_id, chapter_id)
    assert scene["chapterId"] == str(chapter_id)
    assert scene["globalSeq"] == 1

    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter_id}/scenes"
        )
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene['id']}",
            json={"body": "수정된 본문"},
        )
    assert resp.status_code == 200
    assert resp.json()["body"] == "수정된 본문"

    async with _client_as(app, owner) as client:
        resp = await client.delete(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene['id']}"
        )
    assert resp.status_code == 204


async def test_get_scene_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    chapter = await _create_chapter(app, owner, owner_work.id, episode_id)
    chapter_id = uuid.UUID(str(chapter["id"]))
    scene = await _create_scene(app, owner, owner_work.id, episode_id, chapter_id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_work.id}/episodes/{episode_id}/chapters/{chapter_id}"
            f"/scenes/{scene['id']}"
        )
    assert resp.status_code == 404


async def test_global_seq_increases_monotonically_across_chapters_and_episodes(
    app: FastAPI, owner_work: Work
) -> None:
    """씬의 global_seq는 챕터·부가 달라도 작품 내에서 계속 증가해야 한다."""
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    episode1 = await _create_episode(app, owner, owner_work.id, title="1부")
    episode1_id = uuid.UUID(str(episode1["id"]))
    chapter1 = await _create_chapter(app, owner, owner_work.id, episode1_id, title="1장")
    chapter1_id = uuid.UUID(str(chapter1["id"]))

    episode2 = await _create_episode(app, owner, owner_work.id, title="2부", order_index=1)
    episode2_id = uuid.UUID(str(episode2["id"]))
    chapter2 = await _create_chapter(app, owner, owner_work.id, episode2_id, title="2장")
    chapter2_id = uuid.UUID(str(chapter2["id"]))

    scene_a = await _create_scene(app, owner, owner_work.id, episode1_id, chapter1_id)
    scene_b = await _create_scene(app, owner, owner_work.id, episode2_id, chapter2_id)
    scene_c = await _create_scene(
        app, owner, owner_work.id, episode1_id, chapter1_id, order_index=1
    )

    assert [scene_a["globalSeq"], scene_b["globalSeq"], scene_c["globalSeq"]] == [1, 2, 3]
