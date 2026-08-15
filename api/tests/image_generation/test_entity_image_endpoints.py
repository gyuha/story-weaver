"""설정 이미지 목록 조회 + 대표 지정·시각 묘사 수정 PATCH 라우터 테스트 (task 79, TDD).

``test_image_generation_router.py``의 실 DB e2e 패턴을 그대로 따른다 — 서비스를 fake로
override하지 않고 ``get_current_user``만 override해 **HTTP 경로를 실제로 거친다.** 이
작업이 존재하는 이유 자체가 "리포지토리 메서드는 있는데 그 위 이음매가 비어 있었다"이므로,
리포지토리를 직접 부르는 테스트로는 이 작업을 검증할 수 없다.
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
from domains.image_generation.router import generate_router, images_router
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
    app.include_router(generate_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@image-endpoints.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@image-endpoints.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def card_with_two_images(
    two_users: tuple[User, User], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[tuple[Work, Entity, EntityImage, EntityImage]]:
    """실 DB에 work→entity→이미지 2장(첫 장이 대표)을 만든다. 바이트도 실제로 저장한다."""
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
            attributes={"appearance": "칠흑색 장발"},
        )
        session.add(entity)
        await session.flush()

        images: list[EntityImage] = []
        for index, (template_id, is_primary) in enumerate(
            [("ink-character", True), ("webtoon-character", False)]
        ):
            image_id = uuid.uuid4()
            image_storage.save_image(work.id, entity.id, image_id, b"\xff\xd8\xfffake")
            image = EntityImage(
                id=image_id,
                work_id=work.id,
                entity_id=entity.id,
                file_path=f"{work.id}/{entity.id}/{image_id}.jpg",
                template_id=template_id,
                extra_prompt="",
                final_prompt=f"prompt {index}",
                visual_description="첫 장의 묘사" if is_primary else None,
                is_primary=is_primary,
            )
            session.add(image)
            await session.flush()
            images.append(image)
        await session.commit()
        yield work, entity, images[0], images[1]
        await session.delete(entity)
        await session.commit()


async def _reload(image_id: uuid.UUID) -> EntityImage:
    """DB에서 다시 읽는다 — 목이 아니라 실제로 저장됐는지 단정하기 위해."""
    async with AsyncSessionFactory() as session:
        row = await session.get(EntityImage, image_id)
        assert row is not None
        await session.refresh(row)
        return row


# ---------------------------------------------------------------------------
# S1 — 목록 조회
# ---------------------------------------------------------------------------


async def test_list_entity_images_returns_append_order_with_fields(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    owner, _ = two_users
    work, entity, first, second = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/entities/{entity.id}/images")

    assert resp.status_code == 200
    body = resp.json()
    assert [item["id"] for item in body] == [str(first.id), str(second.id)]

    head = body[0]
    assert head["imageUrl"] == f"/api/v1/works/{work.id}/images/{first.id}"
    assert head["isPrimary"] is True
    assert head["visualDescription"] == "첫 장의 묘사"
    assert head["templateId"] == "ink-character"
    assert head["createdAt"]
    assert body[1]["isPrimary"] is False
    assert body[1]["visualDescription"] is None


async def test_list_entity_images_empty_card_returns_empty_array(
    app: FastAPI, two_users: tuple[User, User]
) -> None:
    """이미지가 없으면 빈 배열이다 — 404가 아니다."""
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="빈 작품", short_label="빈", genre="무협", style="간결체"
        )
        session.add(work)
        await session.flush()
        entity = Entity(
            work_id=work.id,
            entity_type=EntityType.item,
            name="빈 아이템",
            summary="",
            attributes={},
        )
        session.add(entity)
        await session.commit()
        work_id, entity_id = work.id, entity.id

    async with _client_as(app, owner) as client:
        resp = await client.get(f"/api/v1/works/{work_id}/entities/{entity_id}/images")

    assert resp.status_code == 200
    assert resp.json() == []

    async with AsyncSessionFactory() as session:
        stale = await session.get(Entity, entity_id)
        if stale is not None:
            await session.delete(stale)
            await session.commit()


async def test_list_entity_images_other_tenant_returns_404(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """남의 work_id로 목록을 요청하면 404 (ADR-0005). 가드를 제거하면 이 테스트가 red가 된다."""
    _, intruder = two_users
    work, entity, _, _ = card_with_two_images

    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{work.id}/entities/{entity.id}/images")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# S2 — 대표 지정 · 시각 묘사 수정 PATCH
# ---------------------------------------------------------------------------


async def test_patch_promotes_new_primary_and_demotes_previous(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """대표를 올리면 이전 대표가 내려간다 — "불렸다"가 아니라 DB의 is_primary를 단정한다."""
    owner, _ = two_users
    work, _, first, second = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{second.id}", json={"isPrimary": True}
        )

    assert resp.status_code == 200
    assert resp.json()["isPrimary"] is True
    assert (await _reload(second.id)).is_primary is True
    assert (await _reload(first.id)).is_primary is False


async def test_patch_promoting_twice_does_not_violate_partial_unique_index(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """연속으로 대표를 바꿔도 부분 유니크 인덱스를 위반하지 않는다(실측)."""
    owner, _ = two_users
    work, _, first, second = card_with_two_images

    async with _client_as(app, owner) as client:
        assert (
            await client.patch(
                f"/api/v1/works/{work.id}/images/{second.id}", json={"isPrimary": True}
            )
        ).status_code == 200
        assert (
            await client.patch(
                f"/api/v1/works/{work.id}/images/{first.id}", json={"isPrimary": True}
            )
        ).status_code == 200

    assert (await _reload(first.id)).is_primary is True
    assert (await _reload(second.id)).is_primary is False


async def test_patch_updates_visual_description(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    owner, _ = two_users
    work, _, _, second = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{second.id}",
            json={"visualDescription": "작가가 고친 묘사"},
        )

    assert resp.status_code == 200
    assert resp.json()["visualDescription"] == "작가가 고친 묘사"
    assert (await _reload(second.id)).visual_description == "작가가 고친 묘사"


async def test_patch_one_field_does_not_clear_the_other(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """부분 갱신 — 한 필드만 보내면 다른 필드는 그대로다.

    `exclude_unset=True`가 그 기계장치지만, **방어 장치가 있다는 것과 이 경로에서 발동한다는
    것은 다른 명제다**(#66). 그래서 DB를 다시 읽어 단정한다.
    """
    owner, _ = two_users
    work, _, first, _ = card_with_two_images

    async with _client_as(app, owner) as client:
        # 대표만 건드린다 → 묘사가 살아 있어야 한다.
        await client.patch(f"/api/v1/works/{work.id}/images/{first.id}", json={"isPrimary": True})
        row = await _reload(first.id)
        assert row.visual_description == "첫 장의 묘사"

        # 묘사만 건드린다 → 대표 상태가 유지돼야 한다.
        await client.patch(
            f"/api/v1/works/{work.id}/images/{first.id}", json={"visualDescription": "고침"}
        )

    row = await _reload(first.id)
    assert row.visual_description == "고침"
    assert row.is_primary is True


async def test_patch_both_fields_at_once(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    owner, _ = two_users
    work, _, _, second = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{second.id}",
            json={"isPrimary": True, "visualDescription": "둘 다"},
        )

    assert resp.status_code == 200
    row = await _reload(second.id)
    assert row.is_primary is True
    assert row.visual_description == "둘 다"


async def test_patch_is_primary_false_is_rejected(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """대표는 다른 장을 올리는 것으로만 바뀐다 — 내리기만 하면 카드가 얼굴을 잃는다."""
    owner, _ = two_users
    work, _, first, _ = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{first.id}", json={"isPrimary": False}
        )

    assert resp.status_code == 422
    assert (await _reload(first.id)).is_primary is True


async def test_patch_empty_visual_description_is_stored(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """빈 문자열은 거부하지 않고 저장한다 — 프롬프트 조립이 공백만인 묘사를 "없는 것"으로
    보고 카드 필드로 폴백하므로(task 77 S1) 그 폴백과 정합한다."""
    owner, _ = two_users
    work, _, first, _ = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{first.id}", json={"visualDescription": ""}
        )

    assert resp.status_code == 200
    assert (await _reload(first.id)).visual_description == ""


async def test_patch_unknown_image_returns_404(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """없는 이미지는 404 — 리포지토리의 set_visual_description은 조용히 반환하므로
    라우터/서비스 층이 404를 만들어야 한다."""
    owner, _ = two_users
    work, _, _, _ = card_with_two_images

    async with _client_as(app, owner) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{uuid.uuid4()}", json={"visualDescription": "x"}
        )

    assert resp.status_code == 404


async def test_patch_other_tenant_returns_404(
    app: FastAPI,
    two_users: tuple[User, User],
    card_with_two_images: tuple[Work, Entity, EntityImage, EntityImage],
) -> None:
    """남의 work_id로 PATCH하면 404이고 데이터는 그대로다."""
    _, intruder = two_users
    work, _, first, _ = card_with_two_images

    async with _client_as(app, intruder) as client:
        resp = await client.patch(
            f"/api/v1/works/{work.id}/images/{first.id}", json={"visualDescription": "침입"}
        )

    assert resp.status_code == 404
    assert (await _reload(first.id)).visual_description == "첫 장의 묘사"
