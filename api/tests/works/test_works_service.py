"""작품 서비스 비즈니스 로직 + 멀티테넌시 격리 검증 (in-memory fake)."""

from __future__ import annotations

import uuid

import pytest

from core.exceptions import NotFoundError
from domains.works.schemas import WorkCreate, WorkUpdate
from domains.works.service import WorksService

from .conftest import FakeWorksRepository


def _create(**over: object) -> WorkCreate:
    data: dict[str, object] = {
        "title": "회귀한 무사",
        "genre": "무협",
        "keywords": ["회귀", "복수"],
        "style": "간결체",
    }
    data.update(over)
    return WorkCreate(**data)  # type: ignore[arg-type]


async def test_create_work_sets_defaults(works_service: WorksService) -> None:
    user_id = uuid.uuid4()
    work = await works_service.create_work(user_id, _create())

    assert work.user_id == user_id
    assert work.short_label == "회"  # 제목 첫 글자
    assert work.sub_genre == "회귀"  # 첫 키워드
    assert work.status == "구상"
    assert work.cover_theme == "dark"
    assert work.keywords == ["회귀", "복수"]


async def test_create_work_sub_genre_falls_back_to_genre(works_service: WorksService) -> None:
    work = await works_service.create_work(uuid.uuid4(), _create(keywords=[]))
    assert work.sub_genre == "무협"


async def test_create_work_blank_title_short_label_fallback(works_service: WorksService) -> None:
    work = await works_service.create_work(uuid.uuid4(), _create(title="   "))
    assert work.short_label == "작"


async def test_list_works_is_scoped_to_user(works_service: WorksService) -> None:
    alice, bob = uuid.uuid4(), uuid.uuid4()
    await works_service.create_work(alice, _create(title="앨리스 작품"))
    await works_service.create_work(bob, _create(title="밥 작품"))

    alice_works = await works_service.list_works(alice)
    assert len(alice_works) == 1
    assert alice_works[0].user_id == alice


async def test_get_work_returns_owned(works_service: WorksService) -> None:
    user_id = uuid.uuid4()
    created = await works_service.create_work(user_id, _create())
    fetched = await works_service.get_work(created.id, user_id)
    assert fetched.id == created.id


async def test_get_work_other_tenant_raises_not_found(works_service: WorksService) -> None:
    owner, intruder = uuid.uuid4(), uuid.uuid4()
    created = await works_service.create_work(owner, _create())
    with pytest.raises(NotFoundError):
        await works_service.get_work(created.id, intruder)


async def test_get_work_missing_raises_not_found(works_service: WorksService) -> None:
    with pytest.raises(NotFoundError):
        await works_service.get_work(uuid.uuid4(), uuid.uuid4())


async def test_update_work_applies_changes(works_service: WorksService) -> None:
    user_id = uuid.uuid4()
    created = await works_service.create_work(user_id, _create())
    updated = await works_service.update_work(
        created.id, user_id, WorkUpdate(title="새 제목", status="연재 중")
    )
    assert updated.title == "새 제목"
    assert updated.status == "연재 중"
    assert updated.genre == "무협"  # 미지정 필드는 보존


async def test_update_work_other_tenant_raises(works_service: WorksService) -> None:
    owner, intruder = uuid.uuid4(), uuid.uuid4()
    created = await works_service.create_work(owner, _create())
    with pytest.raises(NotFoundError):
        await works_service.update_work(created.id, intruder, WorkUpdate(title="탈취"))


async def test_delete_work_removes_owned(works_service: WorksService) -> None:
    user_id = uuid.uuid4()
    created = await works_service.create_work(user_id, _create())
    await works_service.delete_work(created.id, user_id)
    with pytest.raises(NotFoundError):
        await works_service.get_work(created.id, user_id)


async def test_delete_work_other_tenant_raises(works_service: WorksService) -> None:
    owner, intruder = uuid.uuid4(), uuid.uuid4()
    created = await works_service.create_work(owner, _create())
    with pytest.raises(NotFoundError):
        await works_service.delete_work(created.id, intruder)


def test_fake_repo_seed_helper() -> None:
    # conftest seed 헬퍼가 동작함을 확인 (커버리지 + 유틸 검증)
    repo = FakeWorksRepository()
    work = repo.seed(
        user_id=uuid.uuid4(),
        title="t",
        short_label="t",
        genre="무협",
        sub_genre="회귀",
        keywords=["회귀"],
        style="간결체",
        status="구상",
        cover_theme="dark",
    )
    assert work.id in repo.store
