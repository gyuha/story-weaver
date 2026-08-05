"""집필 보조 5개 엔드포인트 HTTP 라우터 테스트 (TDD, plan.md M3-S3).

``POST /works/{work_id}/chapters/{chapter_id}/assist/{continue|infill|dialogue|style|
correct}`` — memory_router.py의 실 DB e2e 패턴을 따르되, LLM 호출만 FAKE 클라이언트로
override한다(``app.dependency_overrides``에 라우터의 티어별 LLM 의존성을 override —
chat 도메인 테스트의 "get_llm_factory override" 관례와 동일한 override 메커니즘).

각 작업의 프롬프트 조립 결과(시스템/사용자 메시지)가 ai-pipeline.md 3.1 표대로
조립됐는지, SSE 응답이 ``[DONE]`` sentinel로 끝나는지 확인한다. 교정(``correct``)은
전체 메모리 검색을 호출하지 않는지까지 확인한다(S3 지시 사항).

마지막 테스트 1건만 실 z.ai(GLM-4.6) LLM을 그대로 호출한다(mock 없음, plan.md S3가
명시한 유일한 실 LLM 통합 테스트) — 응답이 비어있지 않은 텍스트인지만 확인한다.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.database import AsyncSessionFactory, engine
from core.llm_call_context import get_llm_call_context
from domains.assist.router import router as assist_router
from domains.assist.router.assist_router import (
    _continue_llm_client,
    _correct_llm_client,
    _dialogue_llm_client,
    _draft_llm_client,
    _infill_llm_client,
    _style_llm_client,
    _summary_llm_client,
    _title_llm_client,
)
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.budget.service import record_usage
from domains.manuscript.router import router as manuscript_router
from domains.memory.service.memory_search_service import MemorySearchService
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
        owner = User(email=f"owner-{uuid.uuid4().hex}@assist.test")
        intruder = User(email=f"intruder-{uuid.uuid4().hex}@assist.test")
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


async def _create_work(owner: User, title: str) -> Work:
    async with AsyncSessionFactory() as session:
        work = Work(
            user_id=owner.id, title=title, short_label=title[:1], genre="무협", style="간결체"
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
    app.include_router(assist_router, prefix="/api/v1")
    return app


def _client_as(app: FastAPI, user: User, timeout: float = 5.0) -> AsyncClient:
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", timeout=timeout)


class _FakeLLMClient:
    """``AbstractLLMPort.stream``만 흉내내는 fake — 실 LLM 호출 없이 조립된 메시지를 캡처."""

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


async def _create_character(
    app: FastAPI,
    owner: User,
    work_id: uuid.UUID,
    name: str,
    speech_style: str,
    sample_lines: list[str],
) -> dict[str, Any]:
    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{work_id}/entities",
            json={
                "entityType": "character",
                "name": name,
                "summary": "",
                "attributes": {"speech_style": speech_style, "sample_lines": sample_lines},
            },
        )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# 이어쓰기 — 풀세트 메모리 주입 + SSE 스트리밍
# ---------------------------------------------------------------------------


async def test_continue_streams_fake_chunks_and_assembles_full_memory_prompt(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="문 앞에 서 있었다.")
    fake = _FakeLLMClient(["다음 문장 하나.", " 다음 문장 둘."])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 문을 열었다."},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == ["다음 문장 하나.", " 다음 문장 둘.", "[DONE]"]

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "무협" in system_text
    assert "간결체" in system_text
    # ADR `260730-070532` — 연령·수위 지시는 프롬프트에서 제거됐다(부재를 회귀로 고정).
    assert "전체이용가" not in system_text
    assert "다음 문장 3~5개" in system_text
    assert "[메모리 컨텍스트]" in system_text
    assert human_text == "그는 문을 열었다."


async def test_continue_binds_llm_call_context_before_streaming(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """S2 — LLMClient(S3)가 llm_call_logs에 채울 user_id·task가 스트리밍 시점에
    이미 바인딩돼 있어야 한다(core.llm_call_context)."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="문 앞에 서 있었다.")
    captured: dict[str, Any] = {}

    class _CapturingLLMClient:
        async def stream(self, messages: list[Any], **kwargs: Any) -> AsyncIterator[str]:
            context = get_llm_call_context()
            captured["user_id"] = context.user_id
            captured["task"] = context.task
            yield "응답"

    app.dependency_overrides[_continue_llm_client] = _CapturingLLMClient

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 문을 열었다."},
        )

    assert resp.status_code == 200
    assert captured["user_id"] == owner.id
    assert captured["task"] == "assist.continue"


async def test_continue_rejects_blank_cursor_text(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """빈/공백 cursor_text는 422 — LLM 제공사 400(수위 거절로 오인)까지 가지 않게 차단."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id, body="문 앞에 서 있었다.")
    fake = _FakeLLMClient(["안 불려야 함"])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        for blank in ("", "   "):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
                json={"cursorText": blank},
            )
            assert resp.status_code == 422
    assert fake.received_messages == []


# ---------------------------------------------------------------------------
# 인필링 — 앞/뒤 문장이 사용자 메시지에 그대로 담김
# ---------------------------------------------------------------------------


async def test_infill_prompt_contains_before_and_after_text(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["이어지는 문장."])
    app.dependency_overrides[_infill_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/infill",
            json={"beforeText": "앞 문장.", "afterText": "뒤 문장."},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == ["이어지는 문장.", "[DONE]"]

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "사이만 채우고" in system_text
    assert "앞 문장." in human_text
    assert "뒤 문장." in human_text


# ---------------------------------------------------------------------------
# 지문/대사 변환 — 인물 speech_style/sample_lines 강조
# ---------------------------------------------------------------------------


async def test_dialogue_prompt_emphasizes_target_character_speech_style(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    character = await _create_character(
        app,
        owner,
        owner_work.id,
        name="한지원",
        speech_style="반말로 툭툭 던지듯 말한다",
        sample_lines=["됐어.", "신경 꺼."],
    )
    fake = _FakeLLMClient(['"됐어." 지원이 툭 내뱉었다.'])
    app.dependency_overrides[_dialogue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/dialogue",
            json={
                "intent": "지원이 상대의 도움을 단칼에 거절한다.",
                "targetEntityId": character["id"],
            },
        )

    assert resp.status_code == 200
    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "[인물 말투 강조]" in system_text
    assert "반말로 툭툭 던지듯 말한다" in system_text
    assert "됐어." in system_text
    assert human_text == "지원이 상대의 도움을 단칼에 거절한다."


# ---------------------------------------------------------------------------
# 문체 변환 — 경량(P1만) 메모리, 인물 강조 블록 없음
# ---------------------------------------------------------------------------


async def test_style_prompt_uses_light_memory_and_no_character_block(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["재작성된 문장."])
    app.dependency_overrides[_style_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/style",
            json={"text": "그는 화가 났다.", "targetStyle": "하드보일드"},
        )

    assert resp.status_code == 200
    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "의미와 사건은 보존" in system_text
    assert "[인물 말투 강조]" not in system_text
    assert "그는 화가 났다." in human_text
    assert "하드보일드" in human_text


# ---------------------------------------------------------------------------
# 교정 — 전체 메모리 검색 자체를 호출하지 않는다(최소 주입)
# ---------------------------------------------------------------------------


async def test_correct_skips_full_memory_search(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    def _must_not_be_called(self: MemorySearchService, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("correct 작업은 전체 메모리 검색을 호출하면 안 된다")

    monkeypatch.setattr(MemorySearchService, "search", _must_not_be_called)

    fake = _FakeLLMClient(["교정된 문장."])
    app.dependency_overrides[_correct_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/correct",
            json={"text": "그는 조용희 걸었다."},
        )

    assert resp.status_code == 200
    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "고유명사 없음" in system_text
    assert human_text == "그는 조용희 걸었다."


# ---------------------------------------------------------------------------
# 교정 결과 캐싱 (plan.md M4-S2) — 같은 입력+work 반복 시 LLM 미호출
# ---------------------------------------------------------------------------


async def test_correct_second_identical_request_hits_cache_and_skips_llm(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["교정된 문장."])
    app.dependency_overrides[_correct_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        first = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/correct",
            json={"text": "그는 조용희 걸었다."},
        )
        second = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/correct",
            json={"text": "그는 조용희 걸었다."},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert _sse_data_lines(first.text) == ["교정된 문장.", "[DONE]"]
    assert _sse_data_lines(second.text) == ["교정된 문장.", "[DONE]"]  # 캐시 재생
    assert fake.call_count == 1  # 두 번째 호출은 LLM 미호출


async def test_correct_different_text_bypasses_cache(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["교정된 문장."])
    app.dependency_overrides[_correct_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/correct",
            json={"text": "그는 조용희 걸었다."},
        )
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/correct",
            json={"text": "완전히 다른 문장."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 2  # 입력이 다르니 캐시 미스


async def test_correct_different_work_bypasses_cache(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, _ = two_users
    other_work = await _create_work(owner, "다른 작품")
    chapter_a = await _create_chapter(app, owner, owner_work.id)
    chapter_b = await _create_chapter(app, owner, other_work.id)
    fake = _FakeLLMClient(["교정된 문장."])
    app.dependency_overrides[_correct_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter_a['id']}/assist/correct",
            json={"text": "동일한 텍스트."},
        )
        resp = await client.post(
            f"/api/v1/works/{other_work.id}/chapters/{chapter_b['id']}/assist/correct",
            json={"text": "동일한 텍스트."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 2  # work_id가 다르니 캐시가 새지 않고 미스


# ---------------------------------------------------------------------------
# Budget 게이트 (plan.md M4-S2) — LLM 호출 전 사용자 누적 사용량 상한 검사
# ---------------------------------------------------------------------------


async def test_continue_proceeds_when_usage_under_budget_limit(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "1000")
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["문장."])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "..."},
        )

    assert resp.status_code == 200
    assert fake.call_count == 1


async def test_continue_blocked_when_usage_exceeds_budget_limit(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUDGET_TOKEN_LIMIT", "50")
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    await record_usage(owner.id, 100)
    fake = _FakeLLMClient(["문장."])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "..."},
        )

    assert resp.status_code == 429
    assert resp.json()["detail"] == "이번 주기 사용량 한도 도달"
    assert fake.call_count == 0


# ---------------------------------------------------------------------------
# 교차 테넌트 격리 (ADR-0005)
# ---------------------------------------------------------------------------


async def test_continue_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["x"])
    app.dependency_overrides[_continue_llm_client] = lambda: fake

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "..."},
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 화 제목 생성 — 현재 화 본문 근거, 최소 메모리(검색 생략), SSE 스트리밍
# ---------------------------------------------------------------------------


async def test_title_streams_from_body_and_skips_full_memory_search(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    def _must_not_be_called(self: MemorySearchService, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("title 작업은 전체 메모리 검색을 호출하면 안 된다")

    monkeypatch.setattr(MemorySearchService, "search", _must_not_be_called)

    fake = _FakeLLMClient(["빗속의 검"])
    app.dependency_overrides[_title_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/title",
            json={"text": "비 오는 골목, 그는 우산도 없이 서 있었다."},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == ["빗속의 검", "[DONE]"]

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "제목" in system_text
    assert "개행" in system_text
    assert "고유명사 없음" in system_text  # 최소 메모리 주입
    assert human_text == "비 오는 골목, 그는 우산도 없이 서 있었다."


async def test_title_rejects_blank_text(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """빈/공백 본문은 422 — LLM 제공사 400(수위 거절로 오인)까지 가지 않게 차단."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["안 불려야 함"])
    app.dependency_overrides[_title_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        for blank in ("", "   "):
            resp = await client.post(
                f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/title",
                json={"text": blank},
            )
            assert resp.status_code == 422
    assert fake.received_messages == []


async def test_title_other_tenant_returns_404(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    owner, intruder = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)
    fake = _FakeLLMClient(["x"])
    app.dependency_overrides[_title_llm_client] = lambda: fake

    async with _client_as(app, intruder) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/title",
            json={"text": "본문 텍스트."},
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 실 LLM 통합 테스트 (plan.md S3 — continue 1건만, mock 없음)
# ---------------------------------------------------------------------------


async def test_continue_real_llm_returns_nonempty_text(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """LLM 클라이언트를 override하지 않는다 — 실 z.ai(GLM-4.6) 호출.

    응답 내용의 정확성은 어설션하지 않는다(비결정적, LLM 응답) — 비어있지 않은
    텍스트인지만 확인한다.
    """
    owner, _ = two_users
    chapter = await _create_chapter(
        app, owner, owner_work.id, body="비 오는 골목, 그는 우산도 없이 서 있었다."
    )

    async with _client_as(app, owner, timeout=30.0) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/continue",
            json={"cursorText": "그는 하늘을 올려다보았다."},
        )

    assert resp.status_code == 200
    chunks = [c for c in _sse_data_lines(resp.text) if c != "[DONE]"]
    assert "".join(chunks).strip() != ""


async def test_assist_summary_streams_and_skips_memory_search(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """화 요약은 SSE로 흐르고, 전체 메모리 검색은 하지 않는다 (task #67 S3).

    요약의 근거는 전달된 본문 자체다 — 메모리를 주입할 이유가 없다(eco 최소 주입).
    """
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    def _must_not_be_called(self: MemorySearchService, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("요약 작업은 전체 메모리 검색을 호출하면 안 된다")

    monkeypatch.setattr(MemorySearchService, "search", _must_not_be_called)

    fake = _FakeLLMClient(["주인공이 10년 전으로 돌아왔다. 거울에서 낯선 눈을 보았다."])
    app.dependency_overrides[_summary_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/summary",
            json={"text": "그는 10년 전으로 돌아왔다. 거울 속에서 낯선 눈이 그를 보았다."},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == [
        "주인공이 10년 전으로 돌아왔다. 거울에서 낯선 눈을 보았다.",
        "[DONE]",
    ]

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "요약" in system_text
    assert "2~3문장" in system_text
    assert '{"text"' not in system_text, "단일 본문 태스크에 JSONL 계약이 새면 안 된다"
    assert human_text == "그는 10년 전으로 돌아왔다. 거울 속에서 낯선 눈이 그를 보았다."


async def test_assist_summary_rejects_blank_text(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """빈 본문은 422로 막는다 — 제공사 400을 수위 거절로 오인하지 않도록 (title과 같은 가드)."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/summary",
            json={"text": "   "},
        )
    assert resp.status_code == 422


async def test_assist_draft_streams_and_uses_full_memory(
    app: FastAPI,
    owner_work: Work,
    two_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """늘려쓰기는 SSE로 본문을 흘리고 **전체 메모리 검색을 실제로 호출한다** (task #69 S3).

    `title`·`summary` 테스트가 "검색을 호출하면 안 된다"를 단정하는 것의 정반대다 —
    메모리 주입이 "생략 목록에 넣지 않는 것"으로만 켜지므로, 빠뜨려서 켜진 것과
    의도해서 켠 것을 코드로는 구분할 수 없다. 여기서 양성으로 고정한다.
    """
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    searched: list[bool] = []

    async def _record_search(self: MemorySearchService, *args: Any, **kwargs: Any) -> Any:
        searched.append(True)
        return []

    monkeypatch.setattr(MemorySearchService, "search", _record_search)

    fake = _FakeLLMClient(["주인공은 스승 앞에 무릎을 꿇었다."])
    app.dependency_overrides[_draft_llm_client] = lambda: fake

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/draft",
            json={"text": "주인공이 스승을 만나 검을 받는다."},
        )

    assert resp.status_code == 200
    assert _sse_data_lines(resp.text) == ["주인공은 스승 앞에 무릎을 꿇었다.", "[DONE]"]
    assert searched, "늘려쓰기는 전체 메모리 검색을 호출해야 한다"

    system_text = str(fake.received_messages[0].content)
    human_text = str(fake.received_messages[1].content)
    assert "본문을 쓰세요" in system_text
    assert '{"text"' not in system_text, "단일 본문 태스크에 JSONL 계약이 새면 안 된다"
    assert human_text == "주인공이 스승을 만나 검을 받는다."


async def test_assist_draft_rejects_blank_summary(
    app: FastAPI, owner_work: Work, two_users: tuple[User, User]
) -> None:
    """빈 요약은 422로 막는다 — 요약 없이 원고를 쓰라고 시킬 수 없다."""
    owner, _ = two_users
    chapter = await _create_chapter(app, owner, owner_work.id)

    async with _client_as(app, owner) as client:
        resp = await client.post(
            f"/api/v1/works/{owner_work.id}/chapters/{chapter['id']}/assist/draft",
            json={"text": "   "},
        )
    assert resp.status_code == 422
