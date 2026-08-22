"""작품 단위 채팅 HTTP 라우터 테스트 (TDD, work-chat-context S2, ADR-0010).

``/api/v1/works/{work_id}/chat/...`` — assist_router.py의 실 DB e2e 패턴을 따르되,
LLM 호출만 FAKE 클라이언트로 override한다(``app.dependency_overrides``).

핵심 확인 사항:
* 컨텍스트(첫 SystemMessage)에 현재 화 본문 + 메모리 검색 결과가 포함된다.
* 타인 소유 작품 접근은 404(ADR-0005).
* 예산 초과 시 LLM 호출 자체가 차단된다.
* 수위 검열 선제 차단(LLM 미호출) — 그래도 대화 이력에는 남는다.
* 대화가 없는 작품에 첫 메시지를 보내면 지연 생성된다.
* ``POST /conversations``는 호출할 때마다 항상 새 row를 만든다.
* 컨텍스트는 ``system_prompt`` 칼럼이나 DB 메시지로 영속화되지 않는다(순수 user/
  assistant 턴만 남는다).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.service import record_usage
from domains.chat.router import work_router as chat_work_router
from domains.chat.router.chat_router import _work_chat_llm_client
from domains.manuscript.router import router as manuscript_router
from domains.timeline.router import links_router as timeline_links_router
from domains.works.models import Work
from domains.works.router import router as works_router
from domains.worldbible.router import router as worldbible_router


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()


@pytest.fixture
async def two_users() -> AsyncIterator[tuple[User, User]]:
    async with AsyncSessionFactory() as session:
        owner = User(email=f"owner-{uuid.uuid4().hex}@chat-work.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@chat-work.test")
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
async def owner_work_with_style_note(two_users: tuple[User, User]) -> Work:
    owner, _ = two_users
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id,
            title="회귀한 무사",
            short_label="회",
            genre="무협",
            style="간결체",
            style_note="쉼표를 아껴 쓰고 문장은 짧게 끊는다.",
        )
        session.add(work)
        await session.commit()
        return work


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(works_router, prefix="/api/v1")
    app.include_router(manuscript_router, prefix="/api/v1")
    app.include_router(worldbible_router, prefix="/api/v1")
    app.include_router(timeline_links_router, prefix="/api/v1")
    app.include_router(chat_work_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeLLMClient:
    """``AbstractLLMPort.stream``만 흉내내는 fake — 조립된 메시지를 캡처."""

    def __init__(self, chunks: list[str]) -> None:
        self._chunks = chunks
        self.received_messages: list[Any] = []
        self.call_count = 0

    async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
        self.call_count += 1
        self.received_messages = messages
        for chunk in self._chunks:
            yield chunk


def _sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


async def _create_chapter(
    app: FastAPI, owner: User, work_id: uuid.UUID, body: str = "본문"
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        episode = (
            await client.post(
                f"/api/v1/works/{work_id}/episodes", json={"title": "1부", "orderIndex": 0}
            )
        ).json()
        resp = await client.post(
            f"/api/v1/works/{work_id}/episodes/{episode['id']}/chapters",
            json={"title": "1장", "orderIndex": 0, "body": body},
        )
    assert resp.status_code == 201
    return resp.json()


async def _create_entity(
    app: FastAPI, owner: User, work_id: uuid.UUID, name: str, summary: str
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={"entityType": "character", "name": name, "summary": summary, "attributes": {}},
        )
    assert resp.status_code == 201
    return resp.json()


async def _link(
    app: FastAPI, owner: User, work_id: uuid.UUID, chapter_id: str, entity_id: str
) -> None:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/chapters/{chapter_id}/links", json={"entityId": entity_id}
        )
    assert resp.status_code == 201


async def _send_message(
    app: FastAPI, owner: User, work_id: uuid.UUID, chapter_id: str, content: str
) -> Any:
    async with _client_as(app, owner) as client:
        return await client.post(
            f"/api/v1/works/{work_id}/chat/messages",
            json={"content": content, "chapterId": chapter_id},
        )


# ---------------------------------------------------------------------------
# 컨텍스트 조립 — 현재 화 원고 + 메모리
# ---------------------------------------------------------------------------


async def test_context_includes_current_chapter_body_and_memory(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="무사가 산길을 걸었다.")
    entity = await _create_entity(
        app, owner, owner_work.id, name="김무사", summary="주인공의 스승. 과묵하다."
    )
    await _link(app, owner, owner_work.id, chapter["id"], entity["id"])

    fake = _FakeLLMClient(["답변입니다."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "이 장면 어때?")

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == ["답변입니다.", "[DONE]"]
    system_text = str(fake.received_messages[0].content)
    assert "무사가 산길을 걸었다." in system_text
    assert "김무사" in system_text
    assert "주인공의 스승" in system_text
    human_text = str(fake.received_messages[-1].content)
    assert human_text == "이 장면 어때?"


# ---------------------------------------------------------------------------
# 문체 지침(style_note) 조건부 주입 (task #84 S2) — 있으면 포함, 없으면 미포함.
# ---------------------------------------------------------------------------


async def test_context_includes_style_note_when_set(
    app: FastAPI, owner_work_with_style_note: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work_with_style_note.id)
    fake = _FakeLLMClient(["답변입니다."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(
        app, owner, owner_work_with_style_note.id, chapter["id"], "이 장면 어때?"
    )

    assert resp.status_code == 200
    system_text = str(fake.received_messages[0].content)
    assert "쉼표를 아껴 쓰고 문장은 짧게 끊는다." in system_text


async def test_context_omits_style_note_marker_when_not_set(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["답변입니다."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "이 장면 어때?")

    assert resp.status_code == 200
    system_text = str(fake.received_messages[0].content)
    assert "작가가 지정한 문체 지침" not in system_text


# ---------------------------------------------------------------------------
# 교차 테넌트 격리 (ADR-0005)
# ---------------------------------------------------------------------------


async def test_send_message_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["x"])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, intruder, owner_work.id, chapter["id"], "안녕")

    assert resp.status_code == 404
    assert fake.call_count == 0


async def test_get_conversation_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    _owner, intruder = two_users
    async with _client_as(app, intruder) as client:
        resp = await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Budget 게이트
# ---------------------------------------------------------------------------


async def test_send_message_blocked_when_usage_exceeds_budget_limit(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "50")
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    await record_usage(owner.id, 100)
    fake = _FakeLLMClient(["x"])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "안녕")

    assert resp.status_code == 429
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 수위 검열 선제 차단 (ADR-0003)
# ---------------------------------------------------------------------------


async def test_send_message_reaches_llm_for_any_content(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """ADR `260730-070532` — 키워드 선제 가드를 제거했으므로 어떤 입력이든 LLM에 도달한다.

    과거 가드는 한국어 부분 문자열 매칭이라 "돌아보지 마십시오"(보지) 같은 평범한
    문장까지 차단했다.
    """
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["답변입니다."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(
        app, owner, owner_work.id, chapter["id"], "뒤를 돌아보지 마십시오 장면을 써줘"
    )

    assert resp.status_code == 200
    assert fake.call_count == 1
    data_lines = _sse_data_lines(resp.text)
    assert "답변입니다." in data_lines
    assert not any("수위" in line for line in data_lines)

    async with _client_as(app, owner) as client:
        msgs = (
            await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation/messages")
        ).json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]


async def test_send_message_blank_content_rejected_without_calling_llm(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """공백뿐인 content는 422로 거부되고 LLM은 호출되지 않는다."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["안 불려야 함"])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "   ")

    assert resp.status_code == 422
    assert fake.call_count == 0


async def test_send_message_invalid_chapter_id_leaves_no_orphan_user_message(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """존재하지 않는 chapter_id는 404를 반환하고, 답변 없는 user 메시지를 남기지 않는다."""
    owner, _ = two_users
    fake = _FakeLLMClient(["안 불려야 함"])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, str(uuid.uuid4()), "안녕")

    assert resp.status_code == 404
    assert fake.call_count == 0

    async with _client_as(app, owner) as client:
        msgs = (
            await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation/messages")
        ).json()
    assert msgs == []


# ---------------------------------------------------------------------------
# 지연 생성 — 대화가 없는 작품에 첫 메시지
# ---------------------------------------------------------------------------


async def test_send_message_lazily_creates_conversation_when_none_exists(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        before = (await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation")).json()
    assert before is None

    fake = _FakeLLMClient(["답변."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake
    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "질문")
    assert resp.status_code == 200

    async with _client_as(app, owner) as client:
        after = (await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation")).json()
    assert after is not None
    assert after["work_id"] == str(owner_work.id)


# ---------------------------------------------------------------------------
# "새 대화 시작" — 항상 새 row
# ---------------------------------------------------------------------------


async def test_start_new_conversation_always_creates_new_row(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    async with _client_as(app, owner) as client:
        first = await client.post(f"/api/v1/works/{owner_work.id}/chat/conversations")
        second = await client.post(f"/api/v1/works/{owner_work.id}/chat/conversations")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


# ---------------------------------------------------------------------------
# 컨텍스트 비영속화 — system_prompt/DB 메시지로 남지 않는다 (ADR-0010)
# ---------------------------------------------------------------------------


async def test_context_is_not_persisted_as_system_prompt_or_db_message(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="현재 화 본문.")
    fake = _FakeLLMClient(["답변."])
    app.dependency_overrides[_work_chat_llm_client] = lambda: fake

    resp = await _send_message(app, owner, owner_work.id, chapter["id"], "질문입니다")
    assert resp.status_code == 200

    async with _client_as(app, owner) as client:
        conv = (await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation")).json()
        msgs = (
            await client.get(f"/api/v1/works/{owner_work.id}/chat/conversation/messages")
        ).json()

    assert conv["system_prompt"] is None
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[0]["content"] == "질문입니다"
    assert msgs[1]["content"] == "답변."
