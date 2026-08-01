"""LangChain LiteLLM client abstraction for the chat domain.

Provides two public classes and one FastAPI dependency function:

* :class:`LLMClient` — a thin, provider-agnostic wrapper around
  :class:`langchain_litellm.ChatLiteLLM` that satisfies
  :class:`~app.domains.chat.ports.LLMClientProtocol`.

* :class:`DefaultLLMClientFactory` — the production implementation of
  :class:`~app.domains.chat.ports.LLMClientFactoryProtocol`.
  Its single method ``get_llm_client()`` reads
  :class:`~app.core.config.LLMSettings` and returns a
  configured :class:`LLMClient`.

* :func:`get_llm_client` — a module-level factory function (FastAPI
  ``Depends``-compatible) that delegates to
  :class:`DefaultLLMClientFactory`.

Provider switching is transparent — change ``LLM_PROVIDER`` + the matching
API key in ``.env``.  No application-code changes are required.

Usage::

    # In a FastAPI route — type-hint against the protocol, not the concrete class
    from fastapi import Depends
    from langchain_core.messages import HumanMessage, SystemMessage

    from domains.chat.llm_client import get_llm_client
    from domains.chat.ports import LLMClientProtocol

    @router.post("/chat")
    async def chat_endpoint(
        body: ChatRequest,
        llm: LLMClientProtocol = Depends(get_llm_client),
    ) -> dict:
        messages = [
            SystemMessage(content="You are a helpful assistant."),
            HumanMessage(content=body.user_message),
        ]
        # Non-streaming:
        response = await llm.ainvoke(messages)
        return {"reply": response.content}

        # Streaming (SSE):
        # from sse_starlette.sse import EventSourceResponse
        # async def _gen():
        #     async for chunk in llm.astream(messages):
        #         yield {"data": chunk}
        # return EventSourceResponse(_gen())

    # Inject via factory protocol for testing
    from domains.chat.llm_client import DefaultLLMClientFactory
    from domains.chat.ports import LLMClientFactoryProtocol
    from domains.chat.service import ChatService

    def build_service(factory: LLMClientFactoryProtocol = DefaultLLMClientFactory()):
        return ChatService(llm_client=factory.get_llm_client())
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncGenerator, AsyncIterator
from typing import TYPE_CHECKING, Any

import structlog
from langchain_core.messages import BaseMessage
from langchain_core.messages.ai import AIMessage, UsageMetadata
from langchain_core.messages.utils import convert_to_openai_messages

from core.config import LLMSettings, get_settings
from core.llm_call_context import get_llm_call_context
from domains.chat.llm_factory import ProviderFactory
from domains.chat.ports import AbstractLLMPort
from domains.chat.repository.llm_call_log_repository import save_llm_call_log
from infra.llm.provider_factory import make_chat_litellm

if TYPE_CHECKING:
    from langchain_litellm import ChatLiteLLM

logger = structlog.get_logger(__name__)


def _format_prompt(messages: list[BaseMessage]) -> str:
    """프롬프트를 사람이 읽기 좋은 여러 줄 문자열로 만든다(DEBUG 로그용).

    각 메시지를 ``[role] content`` 한 블록으로 찍는다 — SDK의 원시 요청 덤프(헤더·
    idempotency key 등 노이즈 포함)를 대체하는, 프롬프트만 보여주는 형태다.
    """
    return "\n".join(f"[{m.type}] {m.content}" for m in messages)


# ---------------------------------------------------------------------------
# LLMClient
# ---------------------------------------------------------------------------


class LLMClient(AbstractLLMPort):
    """Provider-agnostic async LLM client backed by langchain-litellm.

    This class is a thin, testable wrapper around :class:`ChatLiteLLM` that:

    * Delegates model-string construction to :class:`ProviderFactory` so that
      all routing rules live in a single place.
    * Exposes only the async interface (``ainvoke`` / ``astream``) that the
      chat domain actually needs.
    * Accepts ``override_kwargs`` for per-conversation tuning (e.g. temperature,
      max_tokens) without modifying global settings.

    Parameters
    ----------
    settings:
        :class:`LLMSettings` instance.  If *None*, reads from environment
        variables via a fresh :class:`LLMSettings()` constructor call.
    **override_kwargs:
        Additional keyword arguments forwarded to :class:`ChatLiteLLM`.
        These *override* anything derived from *settings* (e.g.
        ``temperature=0.2``, ``max_tokens=512``).

    Examples
    --------
    >>> # Uses global env-var settings
    >>> client = LLMClient()

    >>> # Custom settings (e.g. per-test)
    >>> from core.config import LLMSettings, LLMProvider
    >>> s = LLMSettings(provider=LLMProvider.openai, default_model="gpt-4o-mini")
    >>> client = LLMClient(settings=s, temperature=0.1)
    """

    def __init__(
        self,
        settings: LLMSettings | None = None,
        **override_kwargs: Any,
    ) -> None:
        resolved: LLMSettings = settings or LLMSettings()
        # Compute base kwargs for model_string / provider metadata extraction.
        # ProviderFactory.make_kwargs delegates to resolved.as_litellm_kwargs().
        base_kwargs: dict[str, Any] = ProviderFactory.make_kwargs(resolved)
        base_kwargs.update(override_kwargs)

        self._model_string: str = str(base_kwargs["model"])
        self._provider: str = resolved.provider.value
        # Delegate ChatLiteLLM instantiation to the infra layer adapter.
        # Tests should patch
        # ``app.infra.llm.provider_factory.ChatLiteLLM``
        # to intercept construction without network calls.
        self._chat: ChatLiteLLM = make_chat_litellm(resolved, **override_kwargs)

        logger.debug(
            "llm_client_initialized",
            model=self._model_string,
            provider=self._provider,
        )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def model_string(self) -> str:
        """Full LiteLLM model identifier (e.g. ``'openai/gpt-4o-mini'``)."""
        return self._model_string

    @property
    def provider(self) -> str:
        """Active provider name (e.g. ``'openai'``, ``'anthropic'``)."""
        return self._provider

    @property
    def chat(self) -> ChatLiteLLM:
        """Underlying :class:`ChatLiteLLM` instance for advanced use cases."""
        return self._chat

    # ------------------------------------------------------------------
    # LLM call logging (ADR-0009 / plan.md S3)
    # ------------------------------------------------------------------

    def _record_call(
        self,
        *,
        start_time: float,
        messages: list[BaseMessage],
        response: str | None,
        error: str | None,
        usage_metadata: UsageMetadata | None,
    ) -> None:
        """Fire-and-forget log of one LLM call (success or failure).

        Reads correlation_id from structlog contextvars (bound by
        ``CorrelationIdMiddleware``) and user_id/task from
        :func:`get_llm_call_context` (bound per-request by each router).
        Delegates the actual INSERT to :func:`save_llm_call_log`, which
        already swallows its own exceptions — this call must never raise,
        so the synchronous prep work (message conversion, contextvar reads)
        is guarded too (ADR-0009: logging must never block the real LLM call).
        """
        try:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            ctx = get_llm_call_context()
            correlation_id = structlog.contextvars.get_contextvars().get("correlation_id")
            openai_messages = convert_to_openai_messages(messages)
        except Exception:
            logger.warning("llm_call_log_prep_failed", exc_info=True)
            return
        asyncio.create_task(  # noqa: RUF006 - intentional fire-and-forget (ADR-0009)
            save_llm_call_log(
                correlation_id=correlation_id,
                user_id=ctx.user_id,
                task=ctx.task,
                model=self._model_string,
                provider=self._provider,
                messages=openai_messages,
                response=response,
                error=error,
                latency_ms=latency_ms,
                prompt_tokens=usage_metadata.get("input_tokens") if usage_metadata else None,
                completion_tokens=usage_metadata.get("output_tokens") if usage_metadata else None,
            )
        )

    # ------------------------------------------------------------------
    # Async interface
    # ------------------------------------------------------------------

    async def ainvoke(
        self,
        messages: list[BaseMessage],
        **kwargs: Any,
    ) -> AIMessage:
        """Invoke the LLM and return the full response as an :class:`AIMessage`.

        Parameters
        ----------
        messages:
            Ordered list of LangChain :class:`BaseMessage` instances
            (e.g. :class:`SystemMessage`, :class:`HumanMessage`,
            :class:`AIMessage` for multi-turn context).
        **kwargs:
            Additional kwargs forwarded to :meth:`ChatLiteLLM.ainvoke`.

        Returns
        -------
        AIMessage
            The model's response.

        Example
        -------
        >>> from langchain_core.messages import HumanMessage
        >>> response = await client.ainvoke([HumanMessage(content="Hello!")])
        >>> print(response.content)
        """
        logger.debug(
            "llm_ainvoke_start",
            model=self._model_string,
            message_count=len(messages),
            prompt=_format_prompt(messages),
        )
        start_time = time.monotonic()
        try:
            result = await self._chat.ainvoke(messages, **kwargs)
        except Exception as exc:
            self._record_call(
                start_time=start_time,
                messages=messages,
                response=None,
                error=str(exc),
                usage_metadata=None,
            )
            raise
        logger.debug(
            "llm_ainvoke_complete",
            model=self._model_string,
            content_length=len(str(result.content)),
            response=str(result.content),
        )
        self._record_call(
            start_time=start_time,
            messages=messages,
            response=str(result.content),
            error=None,
            usage_metadata=result.usage_metadata,
        )
        return result

    async def astream(
        self,
        messages: list[BaseMessage],
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        """Stream the LLM response, yielding non-empty text chunks.

        Designed for use with :class:`sse_starlette.sse.EventSourceResponse`
        to deliver Server-Sent Events to the client.

        Parameters
        ----------
        messages:
            Ordered list of LangChain :class:`BaseMessage` instances.
        **kwargs:
            Additional kwargs forwarded to :meth:`ChatLiteLLM.astream`.

        Yields
        ------
        str
            Individual text chunks as they arrive from the provider.

        Example
        -------
        >>> from sse_starlette.sse import EventSourceResponse
        >>>
        >>> async def _gen():
        ...     async for chunk in client.astream(messages):
        ...         yield {"data": chunk}
        >>>
        >>> return EventSourceResponse(_gen())
        """
        logger.debug(
            "llm_astream_start",
            model=self._model_string,
            message_count=len(messages),
            prompt=_format_prompt(messages),
        )
        start_time = time.monotonic()
        chunk_count = 0
        response_parts: list[str] = []
        usage_metadata: UsageMetadata | None = None
        try:
            async for chunk in self._chat.astream(messages, **kwargs):
                if chunk.usage_metadata:
                    usage_metadata = chunk.usage_metadata
                content = chunk.content
                if content:
                    chunk_count += 1
                    response_parts.append(str(content))
                    yield str(content)
        except asyncio.CancelledError:
            # 클라이언트가 스트림을 끊으면(프론트의 AbortController → http.disconnect →
            # sse-starlette의 태스크그룹 취소) 여기로 온다. ``CancelledError``는
            # ``BaseException``이라 아래 ``except Exception``이 잡지 못하고 루프 뒤 기록에도
            # 도달하지 못해, 처리하지 않으면 이미 토큰을 태운 호출이 로그에 아예 남지 않는다.
            # ``_record_call``은 sync이고 ``asyncio.create_task``로 fire-and-forget하므로
            # 취소된 스코프 안에서도 그대로 동작한다 — shield가 필요 없다(예산 차감처럼
            # ``await``이 필요한 쪽은 상황이 다르다. 라우터 쪽 주석 참조).
            self._record_call(
                start_time=start_time,
                messages=messages,
                response="".join(response_parts),
                error="cancelled",
                usage_metadata=usage_metadata,
            )
            raise
        except Exception as exc:
            self._record_call(
                start_time=start_time,
                messages=messages,
                response=None,
                error=str(exc),
                usage_metadata=None,
            )
            raise
        logger.debug(
            "llm_astream_complete",
            model=self._model_string,
            chunks=chunk_count,
            response="".join(response_parts),
        )
        self._record_call(
            start_time=start_time,
            messages=messages,
            response="".join(response_parts),
            error=None,
            usage_metadata=usage_metadata,
        )

    # ------------------------------------------------------------------
    # AbstractLLMPort bridge methods
    # ------------------------------------------------------------------

    async def invoke(
        self,
        messages: list[BaseMessage],
        **kwargs: Any,
    ) -> AIMessage:
        """Bridge to :meth:`ainvoke` — satisfies :class:`AbstractLLMPort` contract.

        This method delegates directly to :meth:`ainvoke` so that
        :class:`LLMClient` satisfies both :class:`LLMClientProtocol`
        (``ainvoke`` / ``astream``) and :class:`AbstractLLMPort`
        (``invoke`` / ``stream``).

        Parameters
        ----------
        messages:
            Ordered list of LangChain :class:`BaseMessage` instances.
        **kwargs:
            Provider-specific options forwarded to :meth:`ainvoke`.

        Returns
        -------
        AIMessage
            The model's complete response.
        """
        return await self.ainvoke(messages, **kwargs)

    async def stream(
        self,
        messages: list[BaseMessage],
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Bridge to :meth:`astream` — satisfies :class:`AbstractLLMPort` contract.

        This method delegates directly to :meth:`astream` so that
        :class:`LLMClient` satisfies both :class:`LLMClientProtocol`
        (``ainvoke`` / ``astream``) and :class:`AbstractLLMPort`
        (``invoke`` / ``stream``).

        Parameters
        ----------
        messages:
            Ordered list of LangChain :class:`BaseMessage` instances.
        **kwargs:
            Provider-specific options forwarded to :meth:`astream`.

        Yields
        ------
        str
            Non-empty text chunks as they arrive from the provider.
        """
        async for chunk in self.astream(messages, **kwargs):
            yield chunk


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_llm_client() -> LLMClient:
    """FastAPI dependency that returns a configured :class:`LLMClient`.

    Reads LLM settings from the global :class:`Settings` singleton (populated
    from environment variables / ``.env`` file).  The client is constructed
    fresh per-request so that dynamic env changes in tests are picked up.

    This function delegates to :class:`DefaultLLMClientFactory` and is
    kept as a module-level callable for backwards compatibility and for use
    with ``Depends(get_llm_client)`` in routers.

    The preferred type hint for the injected value is
    :class:`~app.domains.chat.ports.LLMClientProtocol`, not the
    concrete :class:`LLMClient`, so that tests can override with any
    compatible mock without inheriting from the concrete class::

        from fastapi import APIRouter, Depends
        from domains.chat.llm_client import get_llm_client
        from domains.chat.ports import LLMClientProtocol

        router = APIRouter()

        @router.post("/messages")
        async def create_message(
            llm: LLMClientProtocol = Depends(get_llm_client),
        ) -> dict:
            ...

    Notes
    -----
    In tests, override this dependency via ``app.dependency_overrides``::

        from unittest.mock import AsyncMock, MagicMock
        from domains.chat.llm_client import get_llm_client
        from domains.chat.ports import LLMClientProtocol

        mock_llm = MagicMock(spec=LLMClientProtocol)
        mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="mocked"))
        app.dependency_overrides[get_llm_client] = lambda: mock_llm
    """
    return DefaultLLMClientFactory().get_llm_client()


# ---------------------------------------------------------------------------
# DefaultLLMClientFactory — concrete LLMClientFactoryProtocol implementation
# ---------------------------------------------------------------------------


class DefaultLLMClientFactory:
    """Production implementation of the LLM client factory protocol.

    Reads :class:`~app.core.config.LLMSettings` from the global
    :class:`~app.core.config.Settings` singleton and constructs a
    fully configured :class:`LLMClient` via ``get_llm_client()``.

    This class satisfies ``LLMClientFactoryProtocol`` structurally, so
    ``isinstance`` checks using the ``@runtime_checkable`` protocol will pass.

    Typical usage
    -------------
    *Production* — let FastAPI inject via ``Depends``::

        from fastapi import Depends
        from domains.chat.llm_client import (
            DefaultLLMClientFactory,
            get_llm_client,
        )
        from domains.chat.ports import LLMClientFactoryProtocol

        def get_factory() -> LLMClientFactoryProtocol:
            return DefaultLLMClientFactory()

    *Testing* — inject a stub factory::

        class StubFactory:
            def get_llm_client(self):
                mock = MagicMock(spec=LLMClientProtocol)
                mock.ainvoke = AsyncMock(return_value=AIMessage(content="stub"))
                return mock

        service = ChatService(llm_client=StubFactory().get_llm_client())

    Notes
    -----
    The factory creates a new :class:`LLMClient` on every ``get_llm_client()``
    call so that runtime settings changes (e.g. during tests) are reflected
    immediately.  Callers that need a long-lived client should cache the
    returned instance themselves.
    """

    def get_llm_client(self) -> LLMClient:
        """Return a :class:`LLMClient` configured from application settings.

        Reads ``LLM_PROVIDER``, ``LLM_DEFAULT_MODEL``, and the corresponding
        API-key environment variables via the cached :func:`get_settings`
        singleton.

        Returns
        -------
        LLMClient
            A fully configured LLM client satisfying
            :class:`~app.domains.chat.ports.LLMClientProtocol`.
        """
        app_settings = get_settings()
        return LLMClient(settings=app_settings.llm)
