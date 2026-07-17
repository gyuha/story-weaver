"""작품 원고 zip 내보내기 HTTP 라우트 — 실 DB + 실 HTTP e2e.

`test_synopsis_route.py`의 실 DB e2e 패턴을 그대로 따른다: 서비스를 fake로 override하지
않고 실 `ManuscriptService`/`WorksService` 경로를 그대로 태워 소유권 체크까지 함께
확인한다. zip 내용 검증은 `zipfile.ZipFile(io.BytesIO(resp.content))`로 한다.
"""

from __future__ import annotations

import io
import uuid
import zipfile
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
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
        owner = User(email=f"owner-{uuid.uuid4().hex}@export.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@export.test")
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
    body: str = "본문",
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters",
            json={"title": title, "orderIndex": order_index, "body": body},
        )
    assert resp.status_code == 201
    return resp.json()


async def test_export_empty_work_returns_400(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 400


async def test_export_episode_without_chapters_returns_400(app: FastAPI, owner_work: Work) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    await _create_episode(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 400


async def test_export_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    episode = await _create_episode(app, owner, owner_work.id)
    episode_id = uuid.UUID(str(episode["id"]))
    await _create_chapter(app, owner, owner_work.id, episode_id)

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 404


async def test_export_builds_zip_with_part_folders_and_chapter_files(
    app: FastAPI, owner_work: Work
) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    ep1 = await _create_episode(app, owner, owner_work.id, title="1부", order_index=0)
    ep1_id = uuid.UUID(str(ep1["id"]))
    await _create_chapter(
        app, owner, owner_work.id, ep1_id, title="1화", order_index=0, body="첫 문단\n\n둘째 문단"
    )

    ep2 = await _create_episode(app, owner, owner_work.id, title="2부", order_index=1)
    ep2_id = uuid.UUID(str(ep2["id"]))
    await _create_chapter(app, owner, owner_work.id, ep2_id, title="2화", order_index=0, body="")
    # 본문이 없는 회차 — 헤더만 있는 파일이 생성돼야 한다

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "attachment" in resp.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert sorted(names) == sorted(["1부/001화_1화.txt", "2부/001화_2화.txt"])

        chapter1_text = zf.read("1부/001화_1화.txt").decode("utf-8")
        assert chapter1_text == "1화\n\n첫 문단\n\n둘째 문단"

        chapter2_text = zf.read("2부/001화_2화.txt").decode("utf-8")
        assert chapter2_text == "2화\n\n"


async def test_export_blank_episode_title_falls_back_to_generated_part_name(
    app: FastAPI, owner_work: Work
) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    episode = await _create_episode(app, owner, owner_work.id, title=" ", order_index=0)
    episode_id = uuid.UUID(str(episode["id"]))
    await _create_chapter(app, owner, owner_work.id, episode_id, title="1화")

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 200

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        assert zf.namelist() == ["제1부/001화_1화.txt"]


async def test_export_disambiguates_duplicate_episode_titles(
    app: FastAPI, owner_work: Work
) -> None:
    """부 title엔 유일성 제약이 없어 서로 다른 두 부가 같은 title을 쓰면 폴더명이
    충돌할 수 있다 — 두 부의 회차 본문이 모두 보존돼야 한다(먼저 쓴 쪽이 덮어써지면 안 됨)."""
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    ep1 = await _create_episode(app, owner, owner_work.id, title="외전", order_index=0)
    ep1_id = uuid.UUID(str(ep1["id"]))
    await _create_chapter(
        app, owner, owner_work.id, ep1_id, title="1화", order_index=0, body="A부 본문"
    )

    ep2 = await _create_episode(app, owner, owner_work.id, title="외전", order_index=1)
    ep2_id = uuid.UUID(str(ep2["id"]))
    await _create_chapter(
        app, owner, owner_work.id, ep2_id, title="1화", order_index=0, body="B부 본문"
    )

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 200

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert len(names) == len(set(names)) == 2
        bodies = [zf.read(name).decode("utf-8") for name in names]
        assert any("A부 본문" in body for body in bodies)
        assert any("B부 본문" in body for body in bodies)


async def test_export_truncates_overlong_title_to_fit_filesystem_segment_limit(
    app: FastAPI, owner_work: Work
) -> None:
    """스키마상 합법(<=255자)인 한글 title도 UTF-8로는 255바이트 세그먼트 한도를
    넘을 수 있다 — 압축 해제가 실패하지 않도록 세그먼트 바이트 길이를 잘라야 한다."""
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    long_title = "가" * 255
    episode = await _create_episode(app, owner, owner_work.id, title=long_title, order_index=0)
    episode_id = uuid.UUID(str(episode["id"]))
    await _create_chapter(app, owner, owner_work.id, episode_id, title=long_title, order_index=0)

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 200

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert len(names) == 1
        folder, filename = names[0].split("/")
        assert len(folder.encode("utf-8")) <= 255
        assert len(filename.encode("utf-8")) <= 255


async def test_export_sanitizes_forbidden_and_traversal_characters(
    app: FastAPI, owner_work: Work
) -> None:
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None

    episode = await _create_episode(app, owner, owner_work.id, title="../../etc", order_index=0)
    episode_id = uuid.UUID(str(episode["id"]))
    await _create_chapter(app, owner, owner_work.id, episode_id, title='1?화*<>|"장', order_index=0)

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/export")
    assert resp.status_code == 200

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert len(names) == 1
        name = names[0]
        assert ".." not in name
        assert name.count("/") == 1
        folder, filename = name.split("/")
        for forbidden_char in '\\:*?"<>|':
            assert forbidden_char not in folder
            assert forbidden_char not in filename
        assert filename.endswith(".txt")
