"""설정 이미지 생성 SSE 라우트 테스트 (plan.md S5+S6, TDD).

worldbible_router 테스트의 실 DB e2e 패턴을 따른다(서비스 fake override 없이
``get_current_user``만 override). 게이트웨이 어댑터(``image_gateway``·
``vision_describe``)는 목으로 세운다(이미지 모델은 쿼터 소진이라 실호출 불가).

S6(취소·부분 실패)는 "목이 불렸다"로 단정하지 않는다 — DB를 실제로 조회해 행이
있는지, 파일이 디스크에 있는지 확인한다. 취소 실측은 실 uvicorn + 실 클라이언트
끊김으로 재현한다(``tests/test_stream_cancel_shield.py``와 같은 이유 — 평범한
``task.cancel()``은 anyio 태스크그룹 취소를 재현하지 못한다).
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.image_generation.models import EntityImage
from domains.image_generation.router.image_generation_router import generate_router
from domains.image_generation.service import image_gateway, image_storage, vision_describe
from domains.works.models import Work
from domains.worldbible.models import Entity, EntityType

pytestmark = pytest.mark.asyncio

_FAKE_JPEG = b"\xff\xd8\xfffake-jpeg-bytes"


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def _isolated_storage_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IMAGE_STORAGE_ROOT", str(tmp_path))


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(generate_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@image-sse.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@image-sse.test")
        session.add_all([owner, intruder])
        await session.commit()
        yield owner, intruder
        await session.delete(owner)
        await session.delete(intruder)
        await session.commit()


@pytest.fixture
async def owner_entity(two_users: tuple[User, User]) -> AsyncIterator[Entity]:
    """화풍이 정해진(``art_style_id="ink"``) 소유자 작품의 인물 카드 1건."""
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id,
            title="회귀한 무사",
            short_label="회",
            genre="무협",
            style="간결체",
            art_style_id="ink",
            art_style_note="무협풍 세계관, 습한 산중 분위기",
        )
        session.add(work)
        await session.flush()
        entity = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="김무사",
            summary="주인공",
            attributes={"appearance": "은발에 붉은 눈동자"},
        )
        session.add(entity)
        await session.commit()
        yield entity
        await session.delete(entity)
        await session.commit()


@pytest.fixture
async def unstyled_owner_entity(two_users: tuple[User, User]) -> AsyncIterator[Entity]:
    """화풍이 아직 없는(``art_style_id`` null) 소유자 작품의 인물 카드 1건."""
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title="현대 로맨스", short_label="현", genre="로맨스", style="담백체"
        )
        session.add(work)
        await session.flush()
        entity = Entity(
            work_id=work.id,
            entity_type=EntityType.character,
            name="이서연",
            summary="주인공",
            attributes={"appearance": "긴 흑발에 갈색 눈동자"},
        )
        session.add(entity)
        await session.commit()
        yield entity
        await session.delete(entity)
        await session.commit()


def _fake_generate_image(*, image_bytes: bytes = _FAKE_JPEG) -> Any:
    async def _fake(prompt: str) -> bytes:
        return image_bytes

    return _fake


def _fake_describe_image(*, text: str = "은발에 붉은 눈동자, 흑색 장포") -> Any:
    async def _fake(data: bytes, *, client: httpx.AsyncClient | None = None) -> str:
        return text

    return _fake


def _parse_sse_events(raw: str) -> list[dict[str, str]]:
    """sse-starlette 와이어 포맷(빈 줄로 구분된 ``field: value`` 블록)을 파싱한다."""
    events: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in raw.splitlines():
        if line == "":
            if current:
                events.append(current)
                current = {}
            continue
        field, _, value = line.partition(": ")
        current[field] = value
    if current:
        events.append(current)
    return events


async def _entity_image_row(image_id: uuid.UUID) -> EntityImage | None:
    async with AsyncSessionFactory() as session:
        result = await session.execute(select(EntityImage).where(EntityImage.id == image_id))
        return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# 단계 이벤트 순서 · [DONE] · 대표 이미지
# ---------------------------------------------------------------------------


async def test_generate_streams_stages_in_order_and_ends_with_done(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    assert resp.status_code == 200
    events = _parse_sse_events(resp.text)
    kinds = [(e.get("event", "message"), e["data"]) for e in events]
    assert ("stage", "prompt") in kinds
    assert ("stage", "image") in kinds
    assert ("stage", "description") in kinds
    assert kinds[-1] == ("message", "[DONE]")
    # 이미지 이벤트가 묘사 이벤트보다 먼저 나온다 (결정적 순서, ADR 260811-234512).
    image_idx = next(i for i, k in enumerate(kinds) if k[0] == "image")
    description_idx = next(i for i, k in enumerate(kinds) if k[0] == "description")
    assert image_idx < description_idx


async def test_first_image_becomes_primary(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    events = _parse_sse_events(resp.text)
    image_event = next(e for e in events if e.get("event") == "image")
    assert '"isPrimary": true' in image_event["data"]

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(EntityImage).where(EntityImage.entity_id == owner_entity.id)
        )
        rows = list(result.scalars().all())
    assert len(rows) == 1
    assert rows[0].is_primary is True


async def test_second_image_does_not_become_primary(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    first_image_id = uuid.uuid4()
    async with AsyncSessionFactory() as session:
        image_storage.save_image(owner_entity.work_id, owner_entity.id, first_image_id, _FAKE_JPEG)
        session.add(
            EntityImage(
                id=first_image_id,
                work_id=owner_entity.work_id,
                entity_id=owner_entity.id,
                file_path=f"{owner_entity.work_id}/{owner_entity.id}/{first_image_id}.jpg",
                template_id="ink-character",
                extra_prompt="",
                final_prompt="이전 생성",
                is_primary=True,
                visual_description="기존 묘사",
            )
        )
        await session.commit()

    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    events = _parse_sse_events(resp.text)
    image_event = next(e for e in events if e.get("event") == "image")
    assert '"isPrimary": false' in image_event["data"]

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(EntityImage.is_primary).where(EntityImage.id == first_image_id)
        )
        assert result.scalar_one() is True


# ---------------------------------------------------------------------------
# 테넌트 가드 · 존재하지 않는 리소스
# ---------------------------------------------------------------------------


async def test_cross_tenant_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_entity: Entity
) -> None:
    """남의 work_id의 엔티티에 생성을 걸면 404 (ADR-0005)."""
    _, intruder = two_users
    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )
    assert resp.status_code == 404


async def test_missing_entity_returns_404(
    app: FastAPI, two_users: tuple[User, User], owner_entity: Entity
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{uuid.uuid4()}/images",
            json={},
        )
    assert resp.status_code == 404


async def test_unstyled_work_rejects_generation_with_409(
    app: FastAPI, two_users: tuple[User, User], unstyled_owner_entity: Entity
) -> None:
    """작품 화풍이 ``null``이면 게이트웨이 429와 구분되는 409로 거부한다(plan.md S5)."""
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{unstyled_owner_entity.work_id}"
            f"/entities/{unstyled_owner_entity.id}/images",
            json={},
        )
    assert resp.status_code == 409

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(EntityImage).where(EntityImage.entity_id == unstyled_owner_entity.id)
        )
        assert result.scalar_one_or_none() is None


async def test_legacy_template_id_field_is_ignored(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """옛 웹이 여전히 보내는 ``templateId``는 조용히 무시되고 작품 화풍으로 조립한다."""
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={"templateId": "webtoon-character", "extraPrompt": "밤 배경"},
        )

    assert resp.status_code == 200
    events = _parse_sse_events(resp.text)
    kinds = [(e.get("event", "message"), e["data"]) for e in events]
    assert kinds[-1] == ("message", "[DONE]")


async def test_generate_final_prompt_contains_style_composition_and_tone(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """성공 시 ``final_prompt``에 작품 화풍·구도·톤 어휘가 모두 들어간다(plan.md S5 DoD)."""
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    import json as _json

    events = _parse_sse_events(resp.text)
    image_event = next(e for e in events if e.get("event") == "image")
    image_id = uuid.UUID(_json.loads(image_event["data"])["imageId"])

    row = await _entity_image_row(image_id)
    assert row is not None
    assert "수묵화풍 삽화" in row.final_prompt  # 화풍(ink)
    assert "상반신 반신 구도" in row.final_prompt  # 구도(character)
    assert "무협풍 세계관, 습한 산중 분위기" in row.final_prompt  # 작품 톤


# ---------------------------------------------------------------------------
# 묘사 단계 실패 — 이미지는 남고 visual_description은 null
# ---------------------------------------------------------------------------


async def test_description_failure_leaves_image_row_with_null_visual_description(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())

    async def _boom(data: bytes, *, client: httpx.AsyncClient | None = None) -> str:
        raise RuntimeError("비전 모델 호출 실패")

    monkeypatch.setattr(vision_describe, "describe_image", _boom)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    assert resp.status_code == 200
    events = _parse_sse_events(resp.text)
    kinds = [(e.get("event", "message"), e["data"]) for e in events]
    assert kinds[-1][0] == "error"
    assert ("message", "[DONE]") not in kinds

    image_event = next(e for e in events if e.get("event") == "image")
    import json as _json

    image_id = uuid.UUID(_json.loads(image_event["data"])["imageId"])

    row = await _entity_image_row(image_id)
    assert row is not None
    assert row.visual_description is None
    data = image_storage.read_image(owner_entity.work_id, owner_entity.id, image_id)
    assert data == _FAKE_JPEG


async def test_image_row_survives_unhandled_exception_after_image_commit(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """이미지 커밋 **후** 진짜(취소가 아닌) 예외가 나도 이미지 행은 롤백되지 않는다.

    묘사 성공 후 ``set_visual_description``에서 예상 못한 예외(예: DB 커넥션 끊김)가
    나는 상황을 흉내낸다. 이 예외는 어디서도 잡히지 않아 그대로 전파되므로, **이미지
    삽입 뒤 즉시 커밋**(ADR 260811-234512)이 없으면 이 예외가 트리거하는 롤백이
    이미지 행까지 함께 지운다 — 실측으로 확인했다(early commit을 지우면 이 테스트는
    red가 된다: 이미지 행 0개).
    """
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(vision_describe, "describe_image", _fake_describe_image())

    from domains.image_generation.repository.entity_image_repository import (
        EntityImageRepository,
    )

    async def _boom_set_visual_description(
        self: EntityImageRepository, image_id: uuid.UUID, text: str
    ) -> None:
        raise RuntimeError("DB 커넥션이 끊겼다고 가정")

    monkeypatch.setattr(
        EntityImageRepository, "set_visual_description", _boom_set_visual_description
    )

    # SSE 응답은 헤더(200)를 스트리밍 시작 시점에 이미 보내므로, 중간에 예외가 나도
    # status_code는 그대로 200이다 — 여기서 단정할 것은 상태 코드가 아니라 DB 행이다.
    app.dependency_overrides[get_current_user] = lambda: owner
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(EntityImage).where(EntityImage.entity_id == owner_entity.id)
        )
        rows = list(result.scalars().all())
    assert len(rows) == 1
    assert rows[0].visual_description is None


async def test_description_success_updates_visual_description(
    app: FastAPI,
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())
    monkeypatch.setattr(
        vision_describe,
        "describe_image",
        _fake_describe_image(text="새로 뽑은 묘사"),
    )

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_entity.work_id}/entities/{owner_entity.id}/images",
            json={},
        )

    events = _parse_sse_events(resp.text)
    image_event = next(e for e in events if e.get("event") == "image")
    import json as _json

    image_id = uuid.UUID(_json.loads(image_event["data"])["imageId"])

    row = await _entity_image_row(image_id)
    assert row is not None
    assert row.visual_description == "새로 뽑은 묘사"


# ---------------------------------------------------------------------------
# S6 — 실 취소 실측: 묘사 단계 중간에 연결이 끊겨도 이미지 행·파일이 남는다
# ---------------------------------------------------------------------------

_CANCEL_TEST_PORT = 8941


async def test_real_disconnect_mid_description_leaves_image_and_null_visual_description(
    two_users: tuple[User, User],
    owner_entity: Entity,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """실 uvicorn + 실 클라이언트 끊김으로 취소를 재현한다.

    평범한 ``task.cancel()``은 anyio 태스크그룹 취소를 재현하지 못한다는
    ``tests/test_stream_cancel_shield.py``의 실측을 그대로 따른다. describe_image를
    일부러 느리게 만들어(2초) 그 사이에 연결을 끊고, **완료 마커가 세워지지 않았음**을
    확인해 진짜로 중간에 끊겼음을(완료 후 우연히 통과한 게 아님을) 증명한다.
    """
    owner, _ = two_users
    completed: list[str] = []

    monkeypatch.setattr(image_gateway, "generate_image", _fake_generate_image())

    async def _slow_describe(data: bytes, *, client: httpx.AsyncClient | None = None) -> str:
        await asyncio.sleep(2.0)
        completed.append("described")
        return "절대 반영되면 안 되는 묘사"

    monkeypatch.setattr(vision_describe, "describe_image", _slow_describe)

    app = FastAPI()
    app.include_router(generate_router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: owner

    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=_CANCEL_TEST_PORT, log_level="error")
    )
    serve_task = asyncio.get_running_loop().create_task(server.serve())
    try:
        while not server.started:
            await asyncio.sleep(0.05)

        received_lines = 0
        async with (
            httpx.AsyncClient(timeout=10) as client,
            client.stream(
                "POST",
                f"http://127.0.0.1:{_CANCEL_TEST_PORT}/api/v1/works/{owner_entity.work_id}"
                f"/entities/{owner_entity.id}/images",
                json={},
            ) as res,
        ):
            async for line in res.aiter_lines():
                received_lines += 1
                if line == "event: image":
                    break

        await asyncio.sleep(1.0)  # 서버 쪽 취소 처리가 끝날 시간(describe의 2초보다 짧게)
    finally:
        server.should_exit = True
        with contextlib.suppress(asyncio.CancelledError):
            await serve_task

    assert received_lines > 0, "이미지 이벤트를 받기 전에 끊겼다면 취소 경로를 시험하지 못한다"
    assert not completed, "describe_image가 취소되지 않고 완주했다 — 취소 경로를 시험하지 못했다"

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(EntityImage).where(EntityImage.entity_id == owner_entity.id)
        )
        rows = list(result.scalars().all())
    assert len(rows) == 1
    assert rows[0].visual_description is None
    data = image_storage.read_image(owner_entity.work_id, owner_entity.id, rows[0].id)
    assert data == _FAKE_JPEG
