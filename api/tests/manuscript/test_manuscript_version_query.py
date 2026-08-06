"""화 버전 조회 API 테스트 (plan.md #72 S3, TDD).

`GET .../chapters/{chapter_id}/versions`(페이지네이션 목록)과
`GET .../chapters/{chapter_id}/versions/{version_id}`(단건)을 확인한다.
`test_manuscript_versions.py`와 동일한 실 DB e2e 패턴(인증만 override, 서비스는 fake로
바꾸지 않는다).
"""

from __future__ import annotations

import uuid
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
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@manuscript-version-query.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@manuscript-version-query.test")
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
async def intruder_work(two_users: tuple[User, User]) -> Work:
    """침입자 본인 소유 작품 — IDOR 테스트에서 침입자가 자기 소유 경로로 호출하는 데 쓴다."""
    _, intruder = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=intruder.id,
            title="침입자의 작품",
            short_label="침",
            genre="현대",
            style="건조체",
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
    app: FastAPI, owner: User, work_id: uuid.UUID, episode_id: uuid.UUID
) -> dict[str, object]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode_id}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": ""},
        )
    assert resp.status_code == 201
    return resp.json()


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


@pytest.fixture
async def owner_and_chapter(app: FastAPI, owner_work: Work) -> tuple[User, dict[str, object]]:
    """소유자 명의로 work → episode → chapter(body="")를 만들어 반환. 버전 0개."""
    async with AsyncSessionFactory() as session:
        owner = await session.get(User, owner_work.user_id)
    assert owner is not None
    episode = await _create_episode(app, owner, owner_work.id)
    chapter = await _create_chapter(app, owner, owner_work.id, uuid.UUID(str(episode["id"])))
    return owner, chapter


def _versions_url(chapter: dict[str, object]) -> str:
    return (
        f"/api/v1/works/{chapter['workId']}/episodes/{chapter['episodeId']}"
        f"/chapters/{chapter['id']}/versions"
    )


def _version_url(chapter: dict[str, object], version_id: object) -> str:
    return f"{_versions_url(chapter)}/{version_id}"


async def _list_versions(
    app: FastAPI, user: User, chapter: dict[str, object], *, limit: int, offset: int
) -> dict[str, object]:
    async with _client_as(app, user) as client:
        resp = await client.get(_versions_url(chapter), params={"limit": limit, "offset": offset})
    assert resp.status_code == 200
    return resp.json()


# 본문 길이가 저마다 달라 char_count/char_delta가 버전마다 구분되게 한다.
# PATCH 순서(오래된 것부터): 가나다(3) → 가나다라마(5) → 가나(2) → 가나다라마바사(7) → 가(1)
_FIVE_BODIES = ["가나다", "가나다라마", "가나", "가나다라마바사", "가"]


async def _seed_five_versions(app: FastAPI, owner: User, chapter: dict[str, object]) -> None:
    for body in _FIVE_BODIES:
        await _patch_chapter(app, owner, chapter, {"body": body})


# ---------------------------------------------------------------------------
# 페이지네이션 — char_delta가 전량 조회 시의 값과 일치
# ---------------------------------------------------------------------------


async def test_paginated_char_delta_matches_full_list(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _seed_five_versions(app, owner, chapter)

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    assert full["total"] == 5
    assert len(full["items"]) == 5
    # 최신순 정렬 확인: char_count 순서가 PATCH 역순(1,7,2,5,3)과 같아야 한다.
    assert [item["charCount"] for item in full["items"]] == [1, 7, 2, 5, 3]
    full_delta_by_id = {item["id"]: item["charDelta"] for item in full["items"]}

    page1 = await _list_versions(app, owner, chapter, limit=2, offset=0)
    assert [item["id"] for item in page1["items"]] == [item["id"] for item in full["items"][:2]]
    for item in page1["items"]:
        assert item["charDelta"] == full_delta_by_id[item["id"]]

    page2 = await _list_versions(app, owner, chapter, limit=2, offset=2)
    assert [item["id"] for item in page2["items"]] == [item["id"] for item in full["items"][2:4]]
    for item in page2["items"]:
        assert item["charDelta"] == full_delta_by_id[item["id"]]

    page3 = await _list_versions(app, owner, chapter, limit=2, offset=4)
    assert len(page3["items"]) == 1
    assert page3["items"][0]["id"] == full["items"][4]["id"]
    assert page3["items"][0]["charDelta"] == full_delta_by_id[page3["items"][0]["id"]]


async def test_oldest_version_char_delta_is_null(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _seed_five_versions(app, owner, chapter)

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    assert full["items"][-1]["charDelta"] is None


async def test_list_item_does_not_include_body(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문 1"})

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    assert "body" not in full["items"][0]


# ---------------------------------------------------------------------------
# char_count 규칙 — web 에디터 상태바(공백류 제거 후 글자 수)와 맞춘다
# (char_length(body) — 공백 포함 전체 문자 수 — 가 아니다)
# ---------------------------------------------------------------------------


async def test_char_count_excludes_whitespace_like_editor_status_bar(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    # 공백(스페이스 2개)·개행 포함 8자, 공백류 제거 시 4자(가나다라).
    await _patch_chapter(app, owner, chapter, {"body": "가 나\n다  라"})

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    assert full["items"][0]["charCount"] == 4


# ---------------------------------------------------------------------------
# has_summary — 최신 버전만 요약을 가질 수 있다(ADR 260805-214733)
# ---------------------------------------------------------------------------


async def test_has_summary_reflects_latest_version_only(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _seed_five_versions(app, owner, chapter)
    await _patch_chapter(app, owner, chapter, {"summary": "요약"})

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    assert full["items"][0]["hasSummary"] is True  # 최신
    assert all(item["hasSummary"] is False for item in full["items"][1:])


# ---------------------------------------------------------------------------
# 단건 조회 — body·summary 포함
# ---------------------------------------------------------------------------


async def test_get_version_detail_includes_body_and_summary(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문 1"})
    await _patch_chapter(app, owner, chapter, {"summary": "요약 1"})

    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    version_id = full["items"][0]["id"]

    async with _client_as(app, owner) as client:
        resp = await client.get(_version_url(chapter, version_id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == version_id
    assert body["body"] == "본문 1"
    assert body["summary"] == "요약 1"


# ---------------------------------------------------------------------------
# limit 상한(100)·음수 거부 — 저장소 최초의 페이지네이션
# ---------------------------------------------------------------------------


async def test_limit_over_100_is_rejected(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    async with _client_as(app, owner) as client:
        resp = await client.get(_versions_url(chapter), params={"limit": 101, "offset": 0})
    assert resp.status_code == 422


async def test_limit_zero_is_rejected(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    async with _client_as(app, owner) as client:
        resp = await client.get(_versions_url(chapter), params={"limit": 0, "offset": 0})
    assert resp.status_code == 422


async def test_negative_offset_is_rejected(
    app: FastAPI, owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    owner, chapter = owner_and_chapter
    async with _client_as(app, owner) as client:
        resp = await client.get(_versions_url(chapter), params={"limit": 10, "offset": -1})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 교차 테넌트 — 남의 화에 대한 두 엔드포인트가 404
# ---------------------------------------------------------------------------


async def test_list_versions_other_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    _owner, intruder = two_users
    _, chapter = owner_and_chapter
    await _patch_chapter(app, _owner, chapter, {"body": "본문"})

    async with _client_as(app, intruder) as client:
        resp = await client.get(_versions_url(chapter), params={"limit": 10, "offset": 0})
    assert resp.status_code == 404


async def test_get_version_other_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_and_chapter: tuple[User, dict[str, object]]
) -> None:
    _owner, intruder = two_users
    owner, chapter = owner_and_chapter
    await _patch_chapter(app, owner, chapter, {"body": "본문"})
    full = await _list_versions(app, owner, chapter, limit=10, offset=0)
    version_id = full["items"][0]["id"]

    async with _client_as(app, intruder) as client:
        resp = await client.get(_version_url(chapter, version_id))
    assert resp.status_code == 404


async def test_get_version_rejects_other_chapters_version_id_via_own_chapter_path(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_and_chapter: tuple[User, dict[str, object]],
    intruder_work: Work,
) -> None:
    """자기(소유) chapter 경로 + 남의 chapter 소속 version_id 조합 — IDOR 차단 확인.

    위 두 교차 테넌트 테스트(292·304행)는 침입자가 소유자의 work_id 경로 전체를 그대로
    쓰는 케이스만 봐, 상위 소유권 체크(get_chapter)에서 이미 404가 나 리포지토리
    ``get_version``의 (chapter_id, version_id) 복합 필터가 실제로 걸리는지는 검증하지
    못한다. 이 테스트는 침입자가 **자기 소유** work/episode/chapter 경로로 호출하되
    version_id만 다른 사용자의 것을 넣어, 그 필터가 실제로 다른 chapter 소속 version_id를
    막아내는지 확인한다.
    """
    owner, owner_chapter = owner_and_chapter
    await _patch_chapter(app, owner, owner_chapter, {"body": "본문"})
    owner_versions = await _list_versions(app, owner, owner_chapter, limit=10, offset=0)
    owner_version_id = owner_versions["items"][0]["id"]

    _, intruder = two_users
    intruder_episode = await _create_episode(app, intruder, intruder_work.id)
    intruder_chapter = await _create_chapter(
        app, intruder, intruder_work.id, uuid.UUID(str(intruder_episode["id"]))
    )

    async with _client_as(app, intruder) as client:
        resp = await client.get(_version_url(intruder_chapter, owner_version_id))
    assert resp.status_code == 404
