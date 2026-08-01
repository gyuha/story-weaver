"""Chat domain HTTP router.

Provides REST + SSE endpoints for LLM-backed conversations.  The active LLM
provider is determined exclusively by the ``LLM_PROVIDER`` environment variable
— switching providers requires only an env-var change, no code modifications.

Routes
------
POST /chat/complete
    Single-turn (or multi-turn) non-streaming completion.  Returns the full
    LLM response in one JSON body.

POST /chat/stream
    Server-Sent Events (SSE) streaming completion.  Yields text fragments as
    they arrive from the LLM provider.  Each event carries one chunk; a final
    ``[DONE]`` sentinel is sent when the stream ends.

GET /chat/provider
    Returns the currently active LLM provider, model name, and full
    LiteLLM model identifier.  Useful for health checks and integration tests.

FastAPI dependency chain
------------------------
::

    Request
        → get_chat_service(factory=get_llm_factory())
            → ChatService(llm_client=factory.get_llm_client())
                → ChatService.complete() / ChatService.stream()
                    → AbstractLLMPort.invoke() / .stream()

Provider switching is transparent because the dependency chain reads from
:func:`get_settings` on every request — changing ``LLM_PROVIDER`` in ``.env``
and restarting the server is all that is required.

Testing pattern — dependency override
--------------------------------------
Inject a stub factory to avoid real LLM calls::

    from domains.chat.container import get_llm_factory
    from domains.chat.ports import LLMClientProtocol

    class StubFactory:
        def get_llm_client(self) -> LLMClientProtocol:
            ...  # return your mock

    app.dependency_overrides[get_llm_factory] = lambda: StubFactory()
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, NoReturn

import anyio
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from langchain_core.messages import AIMessage as LCAIMessage
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from core.config import get_settings
from core.database import get_async_session
from core.exceptions import AppError
from core.llm_call_context import bind_llm_call_context
from core.rate_limit import LLM_RATE_LIMIT, limiter
from domains.assist.tier_routing import Tier, get_client_for_tier
from domains.auth.models import User
from domains.auth.security import get_current_user, require_permission
from domains.budget.dependency import require_budget_available
from domains.budget.service import estimate_tokens, record_usage
from domains.chat.container import get_chat_service
from domains.chat.ports import AbstractLLMPort
from domains.chat.repository import ChatRepository
from domains.chat.schemas import (
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
)
from domains.chat.service import ChatService
from domains.chat.service.chat_context_service import ChatContextService
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.memory.service.memory_search_service import MemorySearchService
from domains.moderation.service import (
    PROVIDER_DECLINE_MESSAGE,
    stream_with_retry,
)
from domains.timeline.repository import TimelineRepository
from domains.timeline.service import TimelineService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

#: 작품 단위 채팅(work-chat-context, ADR-0010) — 씬이 아닌 작품(work) 단위로 대화가
#: 이어지고, 매 메시지마다 현재 화 원고+메모리로 프레시 컨텍스트를 조립한다.
#: timeline_router.py의 ``router``/``links_router`` 분리와 동일 패턴(경로 파라미터가
#: 달라 별도 ``APIRouter`` 인스턴스로 둔다).
work_router = APIRouter(prefix="/works/{work_id}/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    """A single message in a conversation turn.

    Attributes
    ----------
    role:
        Speaker role — ``"user"``, ``"assistant"``, or ``"system"``.
        Unknown roles default to ``HumanMessage``.
    content:
        Text content of the message.
    """

    role: str
    content: str


class ChatRequest(BaseModel):
    """Request body for chat endpoints.

    Attributes
    ----------
    messages:
        Ordered conversation history.  Must contain at least one message.
    system:
        Optional system prompt prepended before all other messages.
        Equivalent to adding a ``{"role": "system", ...}`` entry at the front.
    """

    messages: list[ChatMessage]
    system: str | None = None


class ChatResponse(BaseModel):
    """Response body for the non-streaming ``/complete`` endpoint.

    Attributes
    ----------
    content:
        The model's full reply text.
    model:
        Active LiteLLM model identifier, e.g. ``"openai/gpt-4o-mini"``.
        Included for debugging and provider-routing verification.
    """

    content: str
    model: str | None = None


class ProviderInfoResponse(BaseModel):
    """Response body for the ``/provider`` info endpoint.

    Attributes
    ----------
    provider:
        Active provider name, e.g. ``"openai"``, ``"ollama"``.
    model:
        Base model name, e.g. ``"gpt-4o-mini"``, ``"llama3.2"``.
    litellm_model:
        Full LiteLLM model identifier, e.g. ``"openai/gpt-4o-mini"``.
    """

    provider: str
    model: str
    litellm_model: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _to_langchain_messages(body: ChatRequest) -> list[BaseMessage]:
    """Convert a :class:`ChatRequest` to a list of LangChain :class:`BaseMessage` objects.

    Conversion rules:

    * ``body.system`` → :class:`SystemMessage` prepended before all other messages.
    * ``role="system"``  → :class:`SystemMessage`
    * ``role="assistant"`` → :class:`AIMessage`
    * Any other role (incl. ``"user"``) → :class:`HumanMessage`

    Parameters
    ----------
    body:
        Incoming chat request.

    Returns
    -------
    list[BaseMessage]
        LangChain message list ready for :meth:`ChatService.complete` /
        :meth:`ChatService.stream`.
    """
    messages: list[BaseMessage] = []

    if body.system:
        messages.append(SystemMessage(content=body.system))

    for msg in body.messages:
        if msg.role == "system":
            messages.append(SystemMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(LCAIMessage(content=msg.content))
        else:
            messages.append(HumanMessage(content=msg.content))

    return messages


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/complete",
    response_model=ChatResponse,
    summary="Non-streaming chat completion",
    description=(
        "Send a conversation to the active LLM provider and receive the full "
        "response in a single JSON body.  Provider is set via ``LLM_PROVIDER``."
    ),
)
async def chat_complete(
    body: ChatRequest,
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    """Non-streaming LLM chat completion.

    Converts the request to LangChain messages, delegates to the injected
    :class:`ChatService`, and wraps the response in :class:`ChatResponse`.

    Returns
    -------
    ChatResponse
        The model's complete reply with the active model identifier.

    Raises
    ------
    422
        If ``messages`` is an empty list.
    502
        If the underlying LLM provider returns an error.
    """
    if not body.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one message is required",
        )

    lc_messages = _to_langchain_messages(body)

    try:
        result = await service.complete(lc_messages)
    except Exception as exc:
        logger.error("chat_complete_error", error=str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM provider error: {exc!s}",
        ) from exc

    active_model = get_settings().llm.litellm_model
    logger.info(
        "chat_complete_success",
        model=active_model,
        content_length=len(str(result.content)),
    )
    return ChatResponse(
        content=str(result.content),
        model=active_model,
    )


@router.post(
    "/stream",
    summary="Streaming chat completion (SSE)",
    description=(
        "Stream the LLM response as Server-Sent Events.  Each ``data`` event "
        "carries a text chunk.  A final ``data: [DONE]`` event signals the end."
    ),
)
async def chat_stream(
    body: ChatRequest,
    service: ChatService = Depends(get_chat_service),
) -> EventSourceResponse:
    """SSE streaming LLM chat completion.

    Each non-empty text chunk from the provider is emitted as an SSE
    ``data`` event.  A sentinel ``[DONE]`` event is emitted when the stream
    ends.  Errors during streaming are emitted as ``event: error`` events
    so the client can detect failure without losing already-delivered tokens.

    Returns
    -------
    EventSourceResponse
        SSE stream with one ``data`` event per token chunk.

    Raises
    ------
    422
        If ``messages`` is an empty list.
    """
    if not body.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one message is required",
        )

    lc_messages = _to_langchain_messages(body)

    active_model = get_settings().llm.litellm_model

    async def _event_generator() -> Any:
        """Yield SSE events from the LLM provider stream."""
        try:
            logger.info("chat_stream_start", model=active_model)
            async for chunk in service.stream(lc_messages):
                yield {"data": chunk}
            yield {"data": "[DONE]"}
            logger.info("chat_stream_complete", model=active_model)
        except Exception as exc:
            logger.error("chat_stream_error", error=str(exc), exc_info=True)
            yield {"event": "error", "data": str(exc)}

    return EventSourceResponse(_event_generator())


@router.get(
    "/provider",
    response_model=ProviderInfoResponse,
    summary="Active LLM provider info",
    description=(
        "Return the currently active LLM provider name, model, and full "
        "LiteLLM model identifier.  Useful for health checks and integration tests."
    ),
)
async def get_provider_info() -> ProviderInfoResponse:
    """Return the active LLM provider metadata.

    Reads from :func:`get_settings` so the response always reflects the
    current ``LLM_PROVIDER`` / ``LLM_DEFAULT_MODEL`` environment variables.
    No LLM call is made.

    Returns
    -------
    ProviderInfoResponse
        Active provider, model, and full LiteLLM model identifier.
    """
    s = get_settings()
    return ProviderInfoResponse(
        provider=s.llm.provider.value,
        model=s.llm.default_model,
        litellm_model=s.llm.litellm_model,
    )


# ---------------------------------------------------------------------------
# Conversation management endpoints (authenticated, DB-backed)
# ---------------------------------------------------------------------------


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation",
    dependencies=[Depends(require_permission("chat:write"))],
)
async def create_conversation(
    body: ConversationCreate,
    current_user: Any = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConversationResponse:
    """Create a new conversation session for the authenticated user.

    Requires the ``chat:write`` permission.
    """
    repo = ChatRepository(session)
    active_model = get_settings().llm.litellm_model
    conv = await repo.create_conversation(
        user_id=current_user.id,
        title=body.title,
        system_prompt=body.system_prompt,
        model_name=active_model,
    )
    return ConversationResponse.model_validate(conv)


@router.get(
    "/conversations",
    response_model=list[ConversationResponse],
    summary="List conversations for authenticated user",
)
async def list_conversations(
    current_user: Any = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[ConversationResponse]:
    """Return all conversations for the authenticated user (newest first)."""
    repo = ChatRepository(session)
    convs = await repo.list_conversations(current_user.id)
    return [ConversationResponse.model_validate(c) for c in convs]


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get a conversation",
)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: Any = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConversationResponse:
    """Return a conversation owned by the authenticated user."""
    repo = ChatRepository(session)
    conv = await repo.get_conversation(conversation_id, user_id=current_user.id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return ConversationResponse.model_validate(conv)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
    summary="List messages in a conversation",
)
async def list_messages(
    conversation_id: uuid.UUID,
    current_user: Any = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[MessageResponse]:
    """Return all messages in a conversation (oldest first)."""
    repo = ChatRepository(session)
    conv = await repo.get_conversation(conversation_id, user_id=current_user.id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    msgs = await repo.get_conversation_messages(conversation_id)
    return [MessageResponse.model_validate(m) for m in msgs]


@router.post(
    "/conversations/{conversation_id}/messages",
    summary="Send a message — SSE streaming + DB persistence",
    dependencies=[Depends(require_permission("chat:write"))],
)
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    current_user: Any = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
    service: ChatService = Depends(get_chat_service),
) -> Any:
    """Send a user message and receive an SSE-streamed assistant reply.

    Workflow
    --------
    1. Verify conversation ownership.
    2. Persist the user message.
    3. Rebuild LangChain message list from conversation history.
    4. Stream tokens from the LLM provider.
    5. Collect all chunks; persist the completed assistant message.
    6. If this is the first turn, auto-generate a title.

    Returns an :class:`~sse_starlette.sse.EventSourceResponse` when
    ``body.stream=True`` (default); returns a :class:`MessageResponse` JSON
    body when ``body.stream=False``.

    Requires the ``chat:write`` permission.
    """
    bind_llm_call_context(user_id=current_user.id, task="chat")
    repo = ChatRepository(session)
    conv = await repo.get_conversation(conversation_id, user_id=current_user.id)
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    # Persist user message
    await repo.add_message(conversation_id, "user", body.content)

    # Build message history
    lc_messages: list[BaseMessage] = []
    if conv.system_prompt:
        lc_messages.append(SystemMessage(content=conv.system_prompt))
    history = await repo.get_conversation_messages(conversation_id)
    for hist_msg in history:
        if hist_msg.role == "user":
            lc_messages.append(HumanMessage(content=hist_msg.content))
        elif hist_msg.role == "assistant":
            lc_messages.append(LCAIMessage(content=hist_msg.content))
        elif hist_msg.role == "system":
            lc_messages.append(SystemMessage(content=hist_msg.content))

    is_first_turn = len([m for m in history if m.role == "assistant"]) == 0

    if not body.stream:
        # Non-streaming path
        try:
            result = await service.complete(lc_messages)
        except Exception as exc:
            logger.error("chat_message_complete_error", error=str(exc), exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM provider error: {exc!s}",
            ) from exc

        assistant_content = str(result.content)
        assistant_msg = await repo.add_message(
            conversation_id, "assistant", assistant_content, finish_reason="stop"
        )
        await session.commit()

        # Auto-title on first turn
        if is_first_turn and conv.title is None:
            await _auto_title(repo, conv.id, body.content, assistant_content, service, session)

        return MessageResponse.model_validate(assistant_msg)

    # SSE streaming path
    collected_chunks: list[str] = []

    async def _event_gen() -> Any:
        try:
            logger.info(
                "chat_stream_start",
                conversation_id=str(conversation_id),
                model=conv.model_name,
            )
            async for chunk in service.stream(lc_messages):
                collected_chunks.append(chunk)
                yield {"data": chunk}
            yield {"data": "[DONE]"}
            logger.info("chat_stream_complete", chunks=len(collected_chunks))
        except Exception as exc:
            logger.error("chat_stream_error", error=str(exc), exc_info=True)
            yield {"event": "error", "data": str(exc)}
        finally:
            # Persist assistant message after stream completes
            if collected_chunks:
                assistant_content = "".join(collected_chunks)
                try:
                    await repo.add_message(
                        conversation_id,
                        "assistant",
                        assistant_content,
                        finish_reason="stop",
                    )
                    await session.commit()
                    if is_first_turn and conv.title is None:
                        await _auto_title(
                            repo, conv.id, body.content, assistant_content, service, session
                        )
                except Exception as db_exc:
                    logger.error(
                        "chat_message_persist_failed",
                        error=str(db_exc),
                        exc_info=True,
                    )

    return EventSourceResponse(_event_gen())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _auto_title(
    repo: ChatRepository,
    conv_id: uuid.UUID,
    user_content: str,
    assistant_content: str,
    service: ChatService,
    session: AsyncSession,
) -> None:
    """Generate and save an auto-title after the first turn."""
    try:
        title_messages = [
            SystemMessage(
                content=(
                    "Generate a short, concise title (max 8 words) for this conversation. "
                    "Reply with only the title text, no quotes or punctuation."
                )
            ),
            HumanMessage(
                content=f"User: {user_content[:200]}\nAssistant: {assistant_content[:200]}"
            ),
        ]
        title_result = await service.complete(title_messages)
        title = str(title_result.content).strip()[:256]
        if title:
            await repo.update_conversation_title(conv_id, title)
            await session.commit()
            logger.info("conversation_title_set", conv_id=str(conv_id), title=title)
    except Exception as exc:
        logger.warning("auto_title_failed", conv_id=str(conv_id), error=str(exc))


# ---------------------------------------------------------------------------
# 작품 단위 채팅 엔드포인트 (work-chat-context S2, ADR-0010)
# ---------------------------------------------------------------------------
#
# assist_router.py와 동일 패턴: get_current_user로 인증하고, 교차 테넌트 접근은
# 404(ADR-0005). "현재(최신) 대화"는 work_id로 스코프된 대화 중 가장 최근 것
# (ChatRepository.get_latest_by_work). 컨텍스트(현재 화 원고+메모리)는 매 메시지마다
# ChatContextService로 새로 조립해 임시 SystemMessage로만 쓰고, DB에는 영속화하지
# 않는다(Conversation.system_prompt도 쓰지 않는다) — ADR-0010 핵심 제약.


class _CamelModel(BaseModel):
    """camelCase 입력 (assist_router.py와 동일 패턴)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class SendWorkChatMessageRequest(_CamelModel):
    content: str = Field(min_length=1, max_length=32_000)
    chapter_id: uuid.UUID

    @field_validator("content")
    @classmethod
    def _content_not_blank(cls, value: str) -> str:
        """빈/공백 프롬프트는 LLM 제공사가 400으로 거부해 수위 거절로 오인된다 —
        여기서 차단(assist_router.ContinueRequest._cursor_text_not_blank와 동일 패턴)."""
        if not value.strip():
            raise ValueError("content는 비어 있을 수 없습니다")
        return value


async def _get_works_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorksService:
    return WorksService(WorksRepository(session))


async def _get_chat_context_service(
    session: AsyncSession = Depends(get_async_session),
) -> ChatContextService:
    works_service = WorksService(WorksRepository(session))
    memory_service = MemoryService(MemoryRepository(session))
    worldbible_service = WorldBibleService(
        WorldBibleRepository(session), works_service, memory_service
    )
    manuscript_service = ManuscriptService(
        ManuscriptRepository(session), works_service, memory_service
    )
    timeline_service = TimelineService(
        TimelineRepository(session), worldbible_service, manuscript_service
    )
    memory_search_service = MemorySearchService(
        MemoryRepository(session), worldbible_service, manuscript_service, timeline_service
    )
    return ChatContextService(manuscript_service, memory_search_service, works_service)


def _work_chat_llm_client() -> AbstractLLMPort:
    """분석적 질의응답이라 thinking 모드를 켠 채 high_quality 티어를 쓴다(ADR-0010) —
    5개 집필 보조 작업 전용인 ``get_fast_writing_client``는 여기 쓰지 않는다."""
    return get_client_for_tier(Tier.high_quality)


async def _bind_work_chat_rate_limit_user(
    request: Request, current_user: User = Depends(get_current_user)
) -> None:
    """slowapi 키 함수가 읽는 ``request.state.user``를 채운다(assist_router.py와 동일)."""
    request.state.user = current_user


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


async def _stream_work_chat_response(
    llm: AbstractLLMPort,
    messages: list[BaseMessage],
    user_id: uuid.UUID,
    repo: ChatRepository,
    conversation_id: uuid.UUID,
    session: AsyncSession,
) -> Any:
    """``send_message``의 SSE+영속화 패턴(스트림 종료 후 ``finally``에서 저장)을 그대로
    따르되, moderation 완화 재시도(``stream_with_retry``, ADR-0003)를 거친다."""
    collected_chunks: list[str] = []
    cancelled = False
    try:
        async for chunk in stream_with_retry(llm, messages):
            collected_chunks.append(chunk)
            yield {"data": chunk}
        yield {"data": "[DONE]"}
    except asyncio.CancelledError:
        # 클라이언트가 중단했다 — 아래 finally가 부분 응답을 저장할 때 이 사실을
        # finish_reason에 반영해야 한다. 대입은 await이 아니라 취소된 스코프에서도
        # 실행된다(실측: 실스택 끊김에서 이 경로로 도달해 'cancelled'가 기록됨).
        cancelled = True
        raise
    except Exception as exc:
        logger.error("work_chat_stream_error", error=str(exc), exc_info=True)
        yield {"event": "error", "data": str(exc)}
    finally:
        if collected_chunks:
            assistant_content = "".join(collected_chunks)
            # ``finally``는 취소 시에도 실행되지만, shield가 없으면 **첫 await(add_message)이
            # 즉시 재취소돼** 뒤의 커밋·예산 반영에 도달하지 못한다 — 감싸는 취소 스코프가
            # 아직 취소 상태이기 때문이다(근거·실측은 ``assist_router._stream_response``
            # 주석 참조). 부분 응답을 저장하면서 그 분량을 차감하지 않으면 하드 쿼터를
            # 우회하게 되므로, 저장과 차감을 같은 shield 안에 둔다.
            with anyio.CancelScope(shield=True):
                try:
                    await repo.add_message(
                        conversation_id,
                        "assistant",
                        assistant_content,
                        finish_reason="cancelled" if cancelled else "stop",
                    )
                    await session.commit()
                    if assistant_content != PROVIDER_DECLINE_MESSAGE:
                        await record_usage(user_id, estimate_tokens(assistant_content))
                except Exception as db_exc:
                    logger.error(
                        "work_chat_message_persist_failed", error=str(db_exc), exc_info=True
                    )


@work_router.get(
    "/conversation",
    response_model=ConversationResponse | None,
    summary="작품의 현재(최신) 대화 조회 — 없으면 null",
)
async def get_work_conversation(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    session: AsyncSession = Depends(get_async_session),
) -> ConversationResponse | None:
    try:
        await works_service.get_work(work_id, current_user.id)  # 소유권 확인 (미소유 시 404)
    except AppError as exc:
        _raise_http(exc)
    repo = ChatRepository(session)
    conv = await repo.get_latest_by_work(work_id, current_user.id)
    return ConversationResponse.model_validate(conv) if conv is not None else None


@work_router.get(
    "/conversation/messages",
    response_model=list[MessageResponse],
    summary="작품의 현재 대화 메시지 이력 — 대화가 없으면 빈 배열",
)
async def get_work_conversation_messages(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    session: AsyncSession = Depends(get_async_session),
) -> list[MessageResponse]:
    try:
        await works_service.get_work(work_id, current_user.id)  # 소유권 확인 (미소유 시 404)
    except AppError as exc:
        _raise_http(exc)
    repo = ChatRepository(session)
    conv = await repo.get_latest_by_work(work_id, current_user.id)
    if conv is None:
        return []
    msgs = await repo.get_conversation_messages(conv.id)
    return [MessageResponse.model_validate(m) for m in msgs]


@work_router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="새 대화 시작 — 기존 대화 유무와 무관하게 항상 새 Conversation 생성",
)
async def start_new_work_conversation(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    session: AsyncSession = Depends(get_async_session),
) -> ConversationResponse:
    try:
        await works_service.get_work(work_id, current_user.id)  # 소유권 확인 (미소유 시 404)
    except AppError as exc:
        _raise_http(exc)
    repo = ChatRepository(session)
    conv = await repo.create_conversation(user_id=current_user.id, work_id=work_id)
    await session.commit()
    return ConversationResponse.model_validate(conv)


@work_router.post(
    "/messages",
    summary="작품 채팅 메시지 전송 — 현재 화 원고+메모리 프레시 컨텍스트로 SSE 스트리밍",
    dependencies=[
        Depends(require_budget_available),
        Depends(_bind_work_chat_rate_limit_user),
    ],
)
@limiter.limit(LLM_RATE_LIMIT)
async def send_work_chat_message(
    request: Request,
    work_id: uuid.UUID,
    payload: SendWorkChatMessageRequest,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    context_service: ChatContextService = Depends(_get_chat_context_service),
    llm: AbstractLLMPort = Depends(_work_chat_llm_client),
    session: AsyncSession = Depends(get_async_session),
) -> EventSourceResponse:
    """대화가 없으면 지연 생성 후, 수위 검열 → (수위 통과 시) chapter_id 검증 겸 프레시
    컨텍스트 조립 → 사용자 메시지 저장 → SSE 스트리밍 → 응답 종료 후 assistant 메시지
    저장 순으로 진행한다. chapter_id 검증을 메시지 저장보다 먼저 해 잘못된 chapter_id가
    고아 user 메시지를 남기지 않도록 한다."""
    bind_llm_call_context(user_id=current_user.id, task="chat")
    try:
        await works_service.get_work(work_id, current_user.id)  # 소유권 확인 (미소유 시 404)
    except AppError as exc:
        _raise_http(exc)

    repo = ChatRepository(session)
    conv = await repo.get_latest_by_work(work_id, current_user.id)
    if conv is None:
        conv = await repo.create_conversation(user_id=current_user.id, work_id=work_id)

    # chapter_id 검증을 사용자 메시지 커밋보다 먼저 수행 — 잘못된 chapter_id로 인한
    # 404가 답변 없는 고아 user 메시지를 남기지 않도록 한다.
    try:
        system_text = await context_service.build_context(
            work_id, current_user.id, payload.chapter_id
        )
    except AppError as exc:
        _raise_http(exc)

    await repo.add_message(conv.id, "user", payload.content)
    await session.commit()

    history = await repo.get_conversation_messages(conv.id)
    lc_messages: list[BaseMessage] = [SystemMessage(content=system_text)]
    for hist_msg in history:
        if hist_msg.role == "user":
            lc_messages.append(HumanMessage(content=hist_msg.content))
        elif hist_msg.role == "assistant":
            lc_messages.append(LCAIMessage(content=hist_msg.content))

    return EventSourceResponse(
        _stream_work_chat_response(llm, lc_messages, current_user.id, repo, conv.id, session)
    )
