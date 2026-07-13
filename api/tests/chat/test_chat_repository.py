"""ChatRepository의 작품(work) 스코프 쿼리 실 DB 테스트 (plan.md work-chat-context S1).

ADR-0010: `conversations.work_id`는 nullable FK이고 `(user_id, work_id)` 유니크
제약을 두지 않는다 — "새 대화 시작"이 같은 work_id로 여러 대화를 만들 수 있어야
한다. `test_manuscript_isolation.py`의 실 DB 패턴(AsyncSessionFactory + engine.dispose)을
그대로 재사용한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.chat.repository import ChatRepository
from domains.works.models import Work


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def user_and_work() -> AsyncIterator[tuple[User, Work]]:
    async with AsyncSessionFactory() as session:
        user = User(email=f"chat-repo-{uuid.uuid4().hex}@work-chat-context.test")
        session.add(user)
        await session.flush()
        work = Work(
            user_id=user.id,
            title="회귀한 무사",
            short_label="회",
            genre="무협",
            style="간결체",
        )
        session.add(work)
        await session.commit()
        yield user, work
        # Only delete user — works.user_id and conversations.user_id/work_id
        # are all ondelete=CASCADE, so cascade removes work/conversations too.
        # (Explicitly deleting work as well raced with that cascade and
        # raised a spurious "0 rows matched" SAWarning-as-error.)
        await session.delete(user)
        await session.commit()


async def test_create_conversation_allows_multiple_rows_for_same_work(
    user_and_work: tuple[User, Work],
) -> None:
    """같은 work_id로 대화를 두 개 만들어도 유니크 위반이 나지 않는다."""
    user, work = user_and_work
    async with AsyncSessionFactory() as session:
        repo = ChatRepository(session)
        conv1 = await repo.create_conversation(user_id=user.id, work_id=work.id)
        conv2 = await repo.create_conversation(user_id=user.id, work_id=work.id)
        await session.commit()

    assert conv1.id != conv2.id
    assert conv1.work_id == work.id
    assert conv2.work_id == work.id


async def test_get_latest_by_work_returns_most_recent(
    user_and_work: tuple[User, Work],
) -> None:
    """가장 최근에 만든 대화가 반환된다."""
    user, work = user_and_work
    async with AsyncSessionFactory() as session:
        repo = ChatRepository(session)
        await repo.create_conversation(user_id=user.id, work_id=work.id)
        latest = await repo.create_conversation(user_id=user.id, work_id=work.id)
        await session.commit()

        result = await repo.get_latest_by_work(work_id=work.id, user_id=user.id)

    assert result is not None
    assert result.id == latest.id


async def test_get_latest_by_work_returns_none_when_no_conversation(
    user_and_work: tuple[User, Work],
) -> None:
    user, _work = user_and_work
    async with AsyncSessionFactory() as session:
        repo = ChatRepository(session)
        result = await repo.get_latest_by_work(work_id=uuid.uuid4(), user_id=user.id)

    assert result is None


async def test_create_conversation_without_work_id_is_unaffected(
    user_and_work: tuple[User, Work],
) -> None:
    """work_id 없이(기본값 None) 만든 기존 대화 생성 방식은 영향받지 않는다."""
    user, _work = user_and_work
    async with AsyncSessionFactory() as session:
        repo = ChatRepository(session)
        conv = await repo.create_conversation(user_id=user.id)
        await session.commit()

    assert conv.work_id is None
