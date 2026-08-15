"""image_generation 도메인 — 설정 이미지 바이트 조회 라우터 테스트 (TDD).

worldbible_router 테스트의 실 DB e2e 패턴(서비스 fake override 없이 ``get_current_user``만
override)을 따른다. 이미지 조회는 ``WorksService.get_work``으로 테넌트 가드를 건다
(ADR-0005) — 남의 ``work_id``로 요청하면 404.

옛 ``/image-templates`` 카탈로그·샘플 테스트는 plan.md S4에서 제거했다 — 화풍이
작품 단위로 올라가며 그 엔드포인트 자체가 없어졌다(ADR `260813-110724`). 후신
테스트는 ``test_art_style_endpoints.py``.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.image_generation.models import EntityImage
from domains.image_generation.router import images_router
from domains.image_generation.service import image_storage
from domains.works.models import Work
from domains.worldbible.models import Entity, EntityType


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(images_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    """실 DB에 계정 A(owner)·B(intruder)를 만들고, 종료 후 정리(cascade로 work도 삭제)."""
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@image-gen.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@image-gen.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def owner_entity_image(
    two_users: tuple[User, User], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[EntityImage]:
    """실 DB에 work→entity→entity_image 1건을 만들고, 이미지 바이트도 실제로 저장한다."""
    owner, _ = two_users
    monkeypatch.setenv("IMAGE_STORAGE_ROOT", str(tmp_path))
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.flush()
        entity = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="김무사",
            summary="주인공",
            attributes={},
        )
        session.add(entity)
        await session.flush()

        image_id = uuid.uuid4()
        image_storage.save_image(work.id, entity.id, image_id, b"\xff\xd8\xfffake-jpeg-bytes")
        image = EntityImage(
            id=image_id,
            work_id=work.id,
            entity_id=entity.id,
            file_path=f"{work.id}/{entity.id}/{image_id}.jpg",
            template_id="ink-character",
            extra_prompt="",
            final_prompt="a character portrait",
        )
        session.add(image)
        await session.commit()
        yield image
        await session.delete(entity)
        await session.commit()


# ---------------------------------------------------------------------------
# 설정 이미지 조회 — 인증 + 테넌트 가드
# ---------------------------------------------------------------------------


async def test_get_entity_image_owner_returns_jpeg(
    app: FastAPI, two_users: tuple[User, User], owner_entity_image: EntityImage
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_entity_image.work_id}/images/{owner_entity_image.id}"
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content == b"\xff\xd8\xfffake-jpeg-bytes"


async def test_get_entity_image_missing_image_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_entity_image: EntityImage
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{owner_entity_image.work_id}/images/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_get_entity_image_other_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_entity_image: EntityImage
) -> None:
    """교차 테넌트 격리 — 남의 work_id의 이미지를 요청하면 404 (ADR-0005)."""
    _, intruder = two_users
    async with _client_as(app, intruder) as client:
        resp = await client.get(
            f"/api/v1/works/{owner_entity_image.work_id}/images/{owner_entity_image.id}"
        )
    assert resp.status_code == 404
