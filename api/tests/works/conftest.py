"""works 테스트 픽스처 — 실 DB 없이 in-memory fake로 도메인 로직을 검증한다."""

from __future__ import annotations

import uuid

import pytest

from domains.works.models import Work
from domains.works.service import WorksService


class FakeWorksRepository:
    """in-memory :class:`WorksRepository` 호환 스텁 — id로 저장."""

    def __init__(self) -> None:
        self.store: dict[uuid.UUID, Work] = {}

    async def list_by_user(self, user_id: uuid.UUID) -> list[Work]:
        return [w for w in self.store.values() if w.user_id == user_id]

    async def get_owned(self, work_id: uuid.UUID, user_id: uuid.UUID) -> Work | None:
        work = self.store.get(work_id)
        return work if work is not None and work.user_id == user_id else None

    async def add(self, work: Work) -> Work:
        if work.id is None:  # 실 repo의 flush(서버 default id) 동작 모사
            work.id = uuid.uuid4()
        self.store[work.id] = work
        return work

    async def delete(self, work: Work) -> None:
        self.store.pop(work.id, None)

    # 테스트 시드 헬퍼
    def seed(self, **kwargs: object) -> Work:
        work = Work(id=uuid.uuid4(), **kwargs)  # type: ignore[arg-type]
        self.store[work.id] = work
        return work


@pytest.fixture
def fake_repo() -> FakeWorksRepository:
    return FakeWorksRepository()


@pytest.fixture
def works_service(fake_repo: FakeWorksRepository) -> WorksService:
    return WorksService(fake_repo)  # type: ignore[arg-type]


__all__ = ["FakeWorksRepository", "fake_repo", "works_service"]
