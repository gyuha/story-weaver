"""화 버전 생성 훅 테스트 (plan.md #72 S2, TDD).

`ManuscriptService.update_chapter`가 본문이 실린 PATCH마다 `chapter_versions`에 버전을
append하는지(직전 버전과 본문이 같으면 만들지 않음 — dedup), 요약만 PATCH하면 새 버전
없이 최신 버전의 요약만 갱신하는지 확인한다. `test_manuscript_route.py`와 동일한 실 DB
e2e 패턴(인증만 override, 서비스는 fake로 바꾸지 않는다) — 재임베딩 실패 테스트도 이
패턴을 그대로 써서, lenient mock이 실제 예외 전파·트랜잭션 롤백 경계를 가리지 않게 한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.models import Chapter, ChapterVersion, Episode
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.router import router
from domains.memory.service import MemoryService
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@manuscript-versions.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@manuscript-versions.test")
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


async def _create_episode(app: FastAPI, owner: User, work_id: uuid.UUID) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_chapter(
    app: FastAPI, owner: User, work_id: uuid.UUID, episode_id: uuid.UUID, body: str = "본문"
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": body},
        )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
async def owner_and_chapter(app: FastAPI, owner_work: Work) -> tuple[User, dict[str, object]]:
    """소유자 명의로 work → episode → chapter(body="본문")를 만들어 반환. 이 시점 버전은 0개."""
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    chapter = await _create_chapter(app, owner, owner_work.id, uuid.UUID(str(episode["id"])))
    return owner, chapter


async def _patch_chapter(
    app: FastAPI, owner: User, chapter: dict[str, object], payload: dict[str, object]
) -> None:
    url = (
        f"/api/v1/works/{chapter['workId']}/episodes/{chapter['episodeId']}"
        f"/chapters/{chapter['id']}"
    )
    async with _client_as(app, owner) as client:
        resp = await client.patch(url, json=payload)
    assert resp.status_code == 200


async def _versions(chapter_id: uuid.UUID) -> list[ChapterVersion]:
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(ChapterVersion)
            .where(ChapterVersion.chapter_id == chapter_id)
            .order_by(ChapterVersion.created_at.desc())
        )
        return list(result.scalars().all())


# ---------------------------------------------------------------------------
# S2 완성 기준 ①~④
# ---------------------------------------------------------------------------


async def test_two_different_body_patches_create_two_versions(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문 1"})
    await _patch_chapter(app, owner, chapter, {"body": "본문 2"})

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert [v.body for v in versions] == ["본문 2", "본문 1"]  # 최신순


async def test_same_body_repatch_does_not_duplicate(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "동일 본문"})
    await _patch_chapter(app, owner, chapter, {"body": "동일 본문"})

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert len(versions) == 1


async def test_summary_only_patch_updates_latest_version_without_new_version(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문 1"})  # 버전 1개 생성
    await _patch_chapter(app, owner, chapter, {"summary": "요약 1"})

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert len(versions) == 1
    assert versions[0].summary == "요약 1"


async def test_body_and_summary_together_with_dedup_still_syncs_latest_summary(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    """dedup(본문 동일)이 발동해도 같은 PATCH에 실린 summary는 최신 버전에 반영돼야 한다.

    ADR 260805-214733은 "최신 버전 = 현재 화 상태의 거울"을 불변식으로 세운다. body와
    summary를 한 PATCH로 함께 보냈는데 본문이 직전 버전과 같아 dedup으로 새 버전을 만들지
    않으면, ``elif "summary" in changes`` 분기가 실행되지 않아(if 분기만 탐) 최신 버전의
    summary가 갱신되지 않는 회귀가 있었다(리뷰 발견).
    """
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문 1"})  # 버전 1개, summary=None
    await _patch_chapter(
        app, owner, chapter, {"body": "본문 1", "summary": "새 요약"}
    )  # dedup 발동

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert len(versions) == 1  # dedup으로 새 버전은 안 생긴다
    assert versions[0].summary == "새 요약"  # 그래도 최신 버전의 summary는 갱신돼야 한다


async def test_emptying_body_creates_a_version(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    """`body=""`도 `"body" in changes`이므로 버전을 만든다(값이 아니라 키 존재로 판정)."""
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": ""})

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert len(versions) == 1
    assert versions[0].body == ""


# ---------------------------------------------------------------------------
# dedup은 "직전 버전과만" 비교한다 — "어떤 과거 버전과도 안 겹침"과는 다른 명제
# ---------------------------------------------------------------------------


async def test_reverting_to_a_prior_body_still_creates_a_new_version(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    """X→Y→X로 저장하면 버전이 3개다 — 되돌리기(X 재등장)도 직전(Y)과 다르므로 append.

    "전체 이력과 겹치지 않을 때만 만든다"로 잘못 짜면 세 번째 저장(X)이 첫 버전과
    겹친다는 이유로 버전을 안 만들어 "버전 수 = 저장 횟수" 불변식이 깨진다.
    """
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "X"})
    await _patch_chapter(app, owner, chapter, {"body": "Y"})
    await _patch_chapter(app, owner, chapter, {"body": "X"})

    versions = await _versions(uuid.UUID(str(chapter["id"])))
    assert [v.body for v in versions] == ["X", "Y", "X"]  # 최신순 3개


# ---------------------------------------------------------------------------
# 재임베딩 실패 → 세션 전체 롤백(버전도 남지 않는다)
# ---------------------------------------------------------------------------


async def test_reindex_failure_rolls_back_the_version_too(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    """`index_chapter`가 예외를 던지면 `get_async_session`이 세션 전체를 롤백한다.

    호출 여부만 확인하는 lenient mock이 아니라 실제로 예외를 던져, 실제 라우터 →
    서비스 → 실 DB 세션(커밋/롤백) 경로를 그대로 태운다 — 버전 append가 재임베딩보다
    먼저 일어나든 나중이든, 같은 요청-스코프 트랜잭션이라 예외가 나면 body 변경도
    버전 append도 함께 사라져야 한다.
    """
    owner, chapter = owner_and_chapter
    chapter_id = uuid.UUID(str(chapter["id"]))
    url = (
        f"/api/v1/works/{chapter['workId']}/episodes/{chapter['episodeId']}"
        f"/chapters/{chapter['id']}"
    )

    with patch.object(
        MemoryService, "index_chapter", new=AsyncMock(side_effect=RuntimeError("boom"))
    ):
        app.dependency_overrides[get_current_user] = lambda: owner
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with pytest.raises(RuntimeError, match="boom"):
                await client.patch(url, json={"body": "재임베딩 실패로 사라져야 할 본문"})

    assert await _versions(chapter_id) == []

    async with AsyncSessionFactory() as session:
        row = await session.execute(select(Chapter).where(Chapter.id == chapter_id))
        persisted = row.scalar_one()
        assert persisted.body == "본문"  # owner_and_chapter가 만든 원래 본문 그대로


# ---------------------------------------------------------------------------
# 같은(미커밋) 세션 안에서 add → 즉시 조회가 반영되는가 (autoflush=False 확인 필요 항목)
# ---------------------------------------------------------------------------


async def test_add_version_visible_to_get_latest_within_same_uncommitted_session(
    owner_work: Work,
) -> None:
    """`autoflush=False`라 flush 없인 방금 add한 행이 같은 세션 재조회에 안 보일 수 있다.

    지금 유일한 호출 경로(update_chapter)는 요청 하나당 버전을 최대 1개만 만들어 실제로는
    겪지 않는 상황이지만, 앞으로 한 요청 안에서 두 번 append하는 경로가 생겨도 dedup이
    조용히 무력해지지 않도록 여기서 고정한다. 또한 `clock_timestamp()`가 같은(미커밋)
    트랜잭션 안에서도 서로 다른 `created_at`을 부여해 정렬이 결정적임을 함께 확인한다.
    """
    async with AsyncSessionFactory() as session:
        repo = ManuscriptRepository(session)
        episode = Episode(work_id=owner_work.id, title="1부", order_index=0)
        session.add(episode)
        await session.flush()
        chapter = Chapter(
            work_id=owner_work.id,
            episode_id=episode.id,
            title="1장",
            order_index=0,
            body="A",
            global_seq=1,
        )
        session.add(chapter)
        await session.flush()

        assert await repo.get_latest_version(chapter.id) is None

        v1 = await repo.add_version(ChapterVersion(chapter_id=chapter.id, body="A"))
        latest = await repo.get_latest_version(chapter.id)
        assert latest is not None
        assert latest.id == v1.id  # 커밋 전인데도 방금 add한 행이 조회된다

        v2 = await repo.add_version(ChapterVersion(chapter_id=chapter.id, body="B"))
        latest2 = await repo.get_latest_version(chapter.id)
        assert latest2 is not None
        assert latest2.id == v2.id  # 두 번째로 최신이 뒤집힌다
        assert latest2.created_at > latest.created_at  # 정렬이 결정적이다

        await session.rollback()
