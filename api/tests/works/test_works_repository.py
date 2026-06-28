"""작품 repository 쿼리 검증 — 실 DB 없이 fake 세션으로 statement/호출을 확인."""

from __future__ import annotations

import uuid
from typing import Any

from domains.works.models import Work
from domains.works.repository import WorksRepository


class _Result:
    def __init__(self, rows: list[Any] | None = None, single: Any = None) -> None:
        self._rows = rows or []
        self._single = single

    def scalars(self) -> _Result:
        return self

    def all(self) -> list[Any]:
        return self._rows

    def scalar_one_or_none(self) -> Any:
        return self._single


class _FakeSession:
    def __init__(self, rows: list[Any] | None = None, single: Any = None) -> None:
        self.added: list[Any] = []
        self.flushed = False
        self.executed: list[Any] = []
        self._rows = rows or []
        self._single = single

    async def execute(self, statement: Any) -> _Result:
        self.executed.append(statement)
        return _Result(self._rows, self._single)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        self.flushed = True


def _work(user_id: uuid.UUID) -> Work:
    return Work(
        id=uuid.uuid4(),
        user_id=user_id,
        title="t",
        short_label="t",
        genre="무협",
        sub_genre="회귀",
        keywords=["회귀"],
        style="간결체",
        status="구상",
        cover_theme="dark",
    )


async def test_list_by_user_returns_rows() -> None:
    user_id = uuid.uuid4()
    rows = [_work(user_id)]
    session = _FakeSession(rows=rows)
    repo = WorksRepository(session)  # type: ignore[arg-type]

    result = await repo.list_by_user(user_id)

    assert result == rows
    assert session.executed  # SELECT 실행됨


async def test_get_owned_returns_single() -> None:
    user_id = uuid.uuid4()
    work = _work(user_id)
    session = _FakeSession(single=work)
    repo = WorksRepository(session)  # type: ignore[arg-type]

    result = await repo.get_owned(work.id, user_id)
    assert result is work


async def test_get_owned_returns_none_when_absent() -> None:
    session = _FakeSession(single=None)
    repo = WorksRepository(session)  # type: ignore[arg-type]
    assert await repo.get_owned(uuid.uuid4(), uuid.uuid4()) is None


async def test_add_adds_and_flushes() -> None:
    session = _FakeSession()
    repo = WorksRepository(session)  # type: ignore[arg-type]
    work = _work(uuid.uuid4())

    returned = await repo.add(work)

    assert returned is work
    assert work in session.added
    assert session.flushed is True


async def test_delete_executes_statement() -> None:
    session = _FakeSession()
    repo = WorksRepository(session)  # type: ignore[arg-type]
    work = _work(uuid.uuid4())

    await repo.delete(work)
    assert session.executed  # DELETE 실행됨
