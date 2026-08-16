"""화풍 카탈로그 · 작품 화풍 조회·저장 라우터 테스트 (plan.md S4, TDD).

``test_entity_image_endpoints.py``의 실 DB e2e 패턴을 그대로 따른다 — 서비스를 fake로
override하지 않고 ``get_current_user``만 override해 HTTP 경로를 실제로 거친다.
카탈로그·견본 엔드포인트는 정적 자산이라 인증 불필요, 작품 화풍 조회·저장은
``WorksService.get_work``으로 테넌트 가드를 건다(ADR-0005) — 남의 ``work_id``는 404.
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
from domains.image_generation.router import art_styles_router, works_art_style_router
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(art_styles_router, prefix="/api/v1")
    app.include_router(works_art_style_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anonymous_client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@art-style.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@art-style.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def owner_work(two_users: tuple[User, User]) -> AsyncIterator[Work]:
    """화풍이 아직 없는(``art_style_id`` null) 소유자 작품 1건."""
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.commit()
        yield work
        await session.delete(work)
        await session.commit()


# ---------------------------------------------------------------------------
# 화풍 카탈로그 — 인증 불필요, 14개, 유형별 견본 URL
# ---------------------------------------------------------------------------


async def test_list_art_styles_returns_14_with_sample_urls(app: FastAPI) -> None:
    async with _anonymous_client(app) as client:
        resp = await client.get("/api/v1/art-styles")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 14
    ids = {s["id"] for s in body}
    assert ids == {
        "ink",
        "webtoon",
        "oil",
        "photo",
        "anime",
        "shoujo",
        "watercolor",
        "pen",
        "concept",
        "render3d",
        "noir",
        "oriental",
        "cyberpunk",
        "darkfantasy",
    }
    for style in body:
        assert style["label"]
        samples = style["samples"]
        # C안 화면이 화풍마다 인물·장소·아이템 견본을 보여준다 — 최소 그 셋.
        assert {"character", "location", "item"} <= samples.keys()


async def test_art_style_sample_urls_return_200_jpeg(app: FastAPI) -> None:
    """견본 파일을 갖춘 화풍의 견본 URL은 실제 JPEG를 돌려준다.

    새 화풍 10종의 견본 30장은 part 2/2가 채운다 — 그때 아래 목록을 14종으로 넓히면
    이 테스트가 견본 완비의 기계적 증거가 된다. 견본이 아직 없는 화풍은 404가 정상이며
    (`get_art_style_sample`의 `Sample not yet generated`), 화면은 플레이스홀더를 그린다.
    """
    styles_with_samples = {"ink", "webtoon", "oil", "photo"}
    async with _anonymous_client(app) as client:
        catalog_resp = await client.get("/api/v1/art-styles")
        for style in catalog_resp.json():
            if style["id"] not in styles_with_samples:
                continue
            for sample_url in style["samples"].values():
                resp = await client.get(sample_url)
                assert resp.status_code == 200, sample_url
                assert resp.headers["content-type"] == "image/jpeg"


async def test_art_style_sample_unknown_style_returns_404(app: FastAPI) -> None:
    async with _anonymous_client(app) as client:
        resp = await client.get("/api/v1/art-styles/no-such-style/samples/character")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 작품 화풍 조회·저장 — 인증 + 테넌트 가드
# ---------------------------------------------------------------------------


async def test_get_work_art_style_returns_null_when_unset(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/art-style")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"artStyleId": None, "artStyleNote": None}


async def test_put_then_get_roundtrip(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        put_resp = await client.put(
            f"/api/v1/works/{owner_work.id}/art-style",
            json={"artStyleId": "webtoon", "artStyleNote": "밝고 경쾌한 톤"},
        )
        assert put_resp.status_code == 200
        assert put_resp.json() == {"artStyleId": "webtoon", "artStyleNote": "밝고 경쾌한 톤"}

        get_resp = await client.get(f"/api/v1/works/{owner_work.id}/art-style")
    assert get_resp.status_code == 200
    assert get_resp.json() == {"artStyleId": "webtoon", "artStyleNote": "밝고 경쾌한 톤"}


async def test_put_art_style_note_empty_string_allowed(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.put(
            f"/api/v1/works/{owner_work.id}/art-style",
            json={"artStyleId": "ink", "artStyleNote": ""},
        )
    assert resp.status_code == 200
    assert resp.json() == {"artStyleId": "ink", "artStyleNote": ""}


async def test_put_unknown_art_style_id_returns_422(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.put(
            f"/api/v1/works/{owner_work.id}/art-style",
            json={"artStyleId": "no-such-style"},
        )
    assert resp.status_code == 422


async def test_get_work_art_style_cross_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    """교차 테넌트 격리 — 남의 work_id로 조회하면 404 (ADR-0005)."""
    _, intruder = two_users
    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/art-style")
    assert resp.status_code == 404


async def test_put_work_art_style_cross_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_work: Work
) -> None:
    """교차 테넌트 격리 — 남의 work_id로 저장하면 404 (ADR-0005)."""
    _, intruder = two_users
    async with _client_as(app, intruder) as client:
        resp = await client.put(
            f"/api/v1/works/{owner_work.id}/art-style",
            json={"artStyleId": "ink"},
        )
    assert resp.status_code == 404
