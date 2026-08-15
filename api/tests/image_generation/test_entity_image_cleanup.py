"""카드 삭제 시 이미지 파일 정리 (plan.md S3, TDD).

FK CASCADE는 ``entity_images`` DB 행만 지운다. 서비스가 명시적으로 파일을 지워야
한다(ADR `260811-234511` Consequences). "삭제 함수가 불렸다"가 아니라 **파일이
실제로 디스크에서 사라졌는지**를 tmp_path로 격리한 실 파일시스템에서 단정한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.image_generation.service import image_storage
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.models import Work
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.models import Entity, EntityType
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService


@pytest.fixture(autouse=True)
def _isolated_storage_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IMAGE_STORAGE_ROOT", str(tmp_path))


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    """테스트 후 엔진 풀을 비운다 — 다음 테스트의 이벤트 루프로 커넥션이 새는 것을 막는다.

    test_entity_image_repository.py의 동일 패턴을 따른다.
    """
    yield
    await engine.dispose()


class _Fixture:
    def __init__(self, user_id: uuid.UUID, entity: Entity) -> None:
        self.user_id = user_id
        self.entity = entity


@pytest.fixture
async def fixture() -> AsyncIterator[_Fixture]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"entity-image-cleanup-{uuid.uuid4().hex}@isolation.test")
        session.add(user)
        await session.flush()
        work = Work(
            user_id=user.id, title="회귀한 무사", short_label="회", genre="무협", style="간결체"
        )
        session.add(work)
        await session.flush()
        card = Entity(
            work_id=work.id, entity_type=EntityType.character, name="김무사", summary="주인공"
        )
        session.add(card)
        await session.commit()
        yield _Fixture(user_id=user.id, entity=card)
        await session.delete(user)
        await session.commit()


async def test_delete_entity_removes_its_image_files_from_disk(fixture: _Fixture) -> None:
    entity = fixture.entity
    image_id = uuid.uuid4()
    image_storage.save_image(entity.work_id, entity.id, image_id, b"fake-jpeg-bytes")
    saved_path = (
        image_storage._storage_root() / str(entity.work_id) / str(entity.id) / f"{image_id}.jpg"
    )
    assert saved_path.is_file()

    async with AsyncSessionFactory() as session:
        service = WorldBibleService(
            WorldBibleRepository(session),
            WorksService(WorksRepository(session)),
            MemoryService(MemoryRepository(session)),
        )
        await service.delete_entity(entity.work_id, fixture.user_id, entity.id)
        await session.commit()

    assert not saved_path.exists()
