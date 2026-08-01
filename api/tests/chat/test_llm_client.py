"""Tests for the LLMClient abstraction layer.

Verifies that :class:`LLMClient` correctly:
* Builds ChatLiteLLM with kwargs from ProviderFactory.make_kwargs()
* Exposes model_string and provider properties
* Delegates ainvoke / astream to the underlying ChatLiteLLM
* Yields non-empty string chunks from astream
* The get_llm_client factory returns a correctly configured LLMClient

All tests are pure unit tests that mock ChatLiteLLM to avoid network calls.

Covered scenarios
-----------------
* Constructor wires model string from ProviderFactory
* Override kwargs merge correctly
* ainvoke delegates to ChatLiteLLM.ainvoke and returns AIMessage
* astream yields non-empty chunks, skips empty strings
* get_llm_client reads from Settings.llm
* Dependency override pattern works as documented
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.messages.ai import AIMessageChunk

from core.config import LLMProvider, LLMSettings
from domains.chat.llm_client import LLMClient, get_llm_client

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_llm_settings(
    provider: str = "openai",
    model: str = "gpt-4o-mini",
    *,
    openai_api_key: str = "sk-test",
    anthropic_api_key: str = "",
    gemini_api_key: str = "",
    azure_api_key: str = "",
    azure_endpoint: str = "",
    azure_deployment: str = "",
    azure_api_version: str = "2024-08-01-preview",
    ollama_base_url: str = "http://localhost:11434",
) -> LLMSettings:
    """Construct LLMSettings without touching the environment."""
    return LLMSettings(
        provider=LLMProvider(provider),
        default_model=model,
        OPENAI_API_KEY=openai_api_key,
        ANTHROPIC_API_KEY=anthropic_api_key,
        GEMINI_API_KEY=gemini_api_key,
        AZURE_OPENAI_API_KEY=azure_api_key,
        AZURE_OPENAI_ENDPOINT=azure_endpoint,
        AZURE_OPENAI_DEPLOYMENT=azure_deployment,
        AZURE_OPENAI_API_VERSION=azure_api_version,
        OLLAMA_BASE_URL=ollama_base_url,
    )


def _make_client(
    provider: str = "openai",
    model: str = "gpt-4o-mini",
    *,
    mock_chat: MagicMock | None = None,
    **override_kwargs: Any,
) -> tuple[LLMClient, MagicMock]:
    """Create an LLMClient with a mocked ChatLiteLLM instance.

    Returns (client, mock_chat_instance).
    """
    settings = _make_llm_settings(provider, model)
    with patch("infra.llm.provider_factory.ChatLiteLLM") as MockChatLiteLLM:
        mock_instance = mock_chat or MagicMock()
        MockChatLiteLLM.return_value = mock_instance
        client = LLMClient(settings=settings, **override_kwargs)
        return client, mock_instance


# ---------------------------------------------------------------------------
# Constructor / properties
# ---------------------------------------------------------------------------


class TestLLMClientConstructor:
    """LLMClient must wire ChatLiteLLM with correct kwargs from ProviderFactory."""

    def test_model_string_openai(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(settings=_make_llm_settings("openai", "gpt-4o"))
        assert client.model_string == "openai/gpt-4o"

    def test_model_string_anthropic(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(
                settings=_make_llm_settings(
                    "anthropic",
                    "claude-3-5-sonnet-20241022",
                    anthropic_api_key="test-anthropic-key",  # pragma: allowlist secret
                    openai_api_key="",
                )
            )
        assert client.model_string == "anthropic/claude-3-5-sonnet-20241022"

    def test_model_string_gemini(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(
                settings=_make_llm_settings(
                    "gemini",
                    "gemini-1.5-flash",
                    gemini_api_key="test-gemini-key",  # pragma: allowlist secret
                    openai_api_key="",
                )
            )
        assert client.model_string == "gemini/gemini-1.5-flash"

    def test_model_string_ollama(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(
                settings=_make_llm_settings(
                    "ollama",
                    "llama3.2",
                    openai_api_key="",
                    ollama_base_url="http://localhost:11434",
                )
            )
        assert client.model_string == "ollama/llama3.2"

    def test_model_string_azure_with_deployment(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(
                settings=_make_llm_settings(
                    "azure",
                    "gpt-4o",
                    openai_api_key="",
                    azure_api_key="test-azure-key",  # pragma: allowlist secret
                    azure_endpoint="https://my.openai.azure.com/",
                    azure_deployment="prod-gpt4o",
                )
            )
        assert client.model_string == "azure/prod-gpt4o"

    def test_provider_property(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(settings=_make_llm_settings("openai", "gpt-4o"))
        assert client.provider == "openai"

    def test_provider_property_anthropic(self) -> None:
        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(
                settings=_make_llm_settings(
                    "anthropic",
                    "claude-3-5-haiku-20241022",
                    anthropic_api_key="test-anthropic-key",  # pragma: allowlist secret
                    openai_api_key="",
                )
            )
        assert client.provider == "anthropic"

    def test_chat_property_returns_chat_litellm_instance(self) -> None:
        mock_chat_instance = MagicMock()
        with patch(
            "infra.llm.provider_factory.ChatLiteLLM",
            return_value=mock_chat_instance,
        ):
            client = LLMClient(settings=_make_llm_settings("openai", "gpt-4o"))
        assert client.chat is mock_chat_instance

    def test_override_kwargs_passed_to_chat_litellm(self) -> None:
        captured_kwargs: dict[str, Any] = {}

        def _capture(**kwargs: Any) -> MagicMock:
            captured_kwargs.update(kwargs)
            return MagicMock()

        with patch(
            "infra.llm.provider_factory.ChatLiteLLM",
            side_effect=_capture,
        ):
            LLMClient(
                settings=_make_llm_settings("openai", "gpt-4o"),
                temperature=0.2,
                max_tokens=512,
            )

        assert captured_kwargs.get("temperature") == 0.2
        assert captured_kwargs.get("max_tokens") == 512

    def test_override_kwargs_merge_with_settings_kwargs(self) -> None:
        """Override kwargs must not discard settings-derived keys like 'model'."""
        captured_kwargs: dict[str, Any] = {}

        def _capture(**kwargs: Any) -> MagicMock:
            captured_kwargs.update(kwargs)
            return MagicMock()

        with patch(
            "infra.llm.provider_factory.ChatLiteLLM",
            side_effect=_capture,
        ):
            LLMClient(
                settings=_make_llm_settings("openai", "gpt-4o-mini"),
                temperature=0.5,
            )

        assert "model" in captured_kwargs
        assert captured_kwargs["model"] == "openai/gpt-4o-mini"
        assert captured_kwargs["temperature"] == 0.5

    def test_none_settings_falls_back_to_env(self) -> None:
        """Passing settings=None must not raise; uses LLMSettings() defaults."""
        with (
            patch("domains.chat.llm_client.LLMSettings") as MockLLMSettings,
            patch("domains.chat.llm_client.ProviderFactory") as MockFactory,
            patch("infra.llm.provider_factory.ChatLiteLLM"),
        ):
            mock_settings = MagicMock()
            mock_settings.provider.value = "openai"
            # as_litellm_kwargs must return a real dict so ChatLiteLLM(**kwargs) works
            mock_settings.as_litellm_kwargs.return_value = {"model": "openai/gpt-4o-mini"}
            MockLLMSettings.return_value = mock_settings
            MockFactory.make_kwargs.return_value = {"model": "openai/gpt-4o-mini"}

            client = LLMClient(settings=None)

        MockLLMSettings.assert_called_once_with()
        assert client.model_string == "openai/gpt-4o-mini"


# ---------------------------------------------------------------------------
# ainvoke
# ---------------------------------------------------------------------------


class TestAInvoke:
    """ainvoke must delegate to ChatLiteLLM.ainvoke and return AIMessage."""

    @pytest.mark.asyncio
    async def test_ainvoke_returns_ai_message(self) -> None:
        expected = AIMessage(content="Hello, world!")
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=expected)

        client, _ = _make_client(mock_chat=mock_chat)
        messages = [HumanMessage(content="Hi")]
        result = await client.ainvoke(messages)

        assert result is expected
        assert result.content == "Hello, world!"

    @pytest.mark.asyncio
    async def test_ainvoke_passes_messages_to_chat(self) -> None:
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=AIMessage(content="ok"))

        client, _ = _make_client(mock_chat=mock_chat)
        messages = [
            SystemMessage(content="Be concise."),
            HumanMessage(content="What is 2+2?"),
        ]
        await client.ainvoke(messages)

        mock_chat.ainvoke.assert_awaited_once()
        call_args = mock_chat.ainvoke.await_args
        assert call_args is not None
        passed_messages = call_args[0][0]
        assert len(passed_messages) == 2
        assert passed_messages[0].content == "Be concise."
        assert passed_messages[1].content == "What is 2+2?"

    @pytest.mark.asyncio
    async def test_ainvoke_forwards_extra_kwargs(self) -> None:
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=AIMessage(content="ok"))

        client, _ = _make_client(mock_chat=mock_chat)
        await client.ainvoke([HumanMessage(content="hi")], stop=["<END>"])

        call_kwargs = mock_chat.ainvoke.await_args[1]
        assert call_kwargs.get("stop") == ["<END>"]

    @pytest.mark.asyncio
    async def test_ainvoke_with_empty_message_list(self) -> None:
        """Edge case: empty message list is forwarded as-is."""
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=AIMessage(content=""))

        client, _ = _make_client(mock_chat=mock_chat)
        result = await client.ainvoke([])

        mock_chat.ainvoke.assert_awaited_once()
        assert result.content == ""

    @pytest.mark.asyncio
    async def test_ainvoke_multi_turn_conversation(self) -> None:
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=AIMessage(content="4"))

        client, _ = _make_client(mock_chat=mock_chat)
        messages = [
            SystemMessage(content="You are a math tutor."),
            HumanMessage(content="What is 2+2?"),
            AIMessage(content="2+2 equals 4."),
            HumanMessage(content="Show me another way."),
        ]
        result = await client.ainvoke(messages)

        mock_chat.ainvoke.assert_awaited_once()
        assert result is not None


# ---------------------------------------------------------------------------
# astream
# ---------------------------------------------------------------------------


class TestAStream:
    """astream must yield non-empty text chunks from the underlying stream."""

    @pytest.mark.asyncio
    async def test_astream_yields_chunks(self) -> None:
        chunks = [
            AIMessageChunk(content="Hello"),
            AIMessageChunk(content=", "),
            AIMessageChunk(content="world"),
            AIMessageChunk(content="!"),
        ]

        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            for chunk in chunks:
                yield chunk

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream

        client, _ = _make_client(mock_chat=mock_chat)
        messages = [HumanMessage(content="Say hello")]

        collected: list[str] = []
        async for chunk in client.astream(messages):
            collected.append(chunk)

        assert collected == ["Hello", ", ", "world", "!"]

    @pytest.mark.asyncio
    async def test_astream_skips_empty_content_chunks(self) -> None:
        """Empty content chunks (e.g. finish_reason markers) must not be yielded."""
        chunks = [
            AIMessageChunk(content="token1"),
            AIMessageChunk(content=""),  # should be skipped
            AIMessageChunk(content="token2"),
            AIMessageChunk(content=""),  # should be skipped
        ]

        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            for chunk in chunks:
                yield chunk

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream

        client, _ = _make_client(mock_chat=mock_chat)
        collected: list[str] = []
        async for chunk in client.astream([HumanMessage(content="test")]):
            collected.append(chunk)

        assert collected == ["token1", "token2"]
        assert "" not in collected

    @pytest.mark.asyncio
    async def test_astream_yields_strings(self) -> None:
        """Chunks must be str, not AIMessageChunk or any other type."""
        chunks = [AIMessageChunk(content="hello"), AIMessageChunk(content=" world")]

        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            for chunk in chunks:
                yield chunk

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream

        client, _ = _make_client(mock_chat=mock_chat)
        async for chunk in client.astream([HumanMessage(content="test")]):
            assert isinstance(chunk, str), f"Expected str, got {type(chunk)}"

    @pytest.mark.asyncio
    async def test_astream_empty_response(self) -> None:
        """An LLM that streams no content yields nothing."""

        async def _empty_stream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            # Async generator that yields nothing — iterating over an empty sequence
            for _item in ():
                yield AIMessageChunk(content=str(_item))

        mock_chat = MagicMock()
        mock_chat.astream = _empty_stream

        client, _ = _make_client(mock_chat=mock_chat)
        collected: list[str] = []
        async for chunk in client.astream([HumanMessage(content="test")]):
            collected.append(chunk)

        assert collected == []

    @pytest.mark.asyncio
    async def test_astream_passes_messages(self) -> None:
        """Messages passed to astream must reach the underlying chat."""
        received_messages: list[Any] = []

        async def _tracking_stream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            received_messages.extend(messages)
            yield AIMessageChunk(content="ok")

        mock_chat = MagicMock()
        mock_chat.astream = _tracking_stream

        client, _ = _make_client(mock_chat=mock_chat)
        target = [
            SystemMessage(content="Be brief."),
            HumanMessage(content="Ping"),
        ]
        async for _ in client.astream(target):
            pass

        assert len(received_messages) == 2
        assert received_messages[0].content == "Be brief."
        assert received_messages[1].content == "Ping"

    @pytest.mark.asyncio
    async def test_astream_forwards_extra_kwargs(self) -> None:
        received_kwargs: dict[str, Any] = {}

        async def _capturing_stream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            received_kwargs.update(kwargs)
            yield AIMessageChunk(content="chunk")

        mock_chat = MagicMock()
        mock_chat.astream = _capturing_stream

        client, _ = _make_client(mock_chat=mock_chat)
        async for _ in client.astream([HumanMessage(content="test")], stop=["<END>"]):
            pass

        assert received_kwargs.get("stop") == ["<END>"]


# ---------------------------------------------------------------------------
# get_llm_client — FastAPI dependency factory
# ---------------------------------------------------------------------------


class TestGetLlmClient:
    """get_llm_client must return an LLMClient configured from global settings."""

    def test_returns_llm_client_instance(self) -> None:
        with (
            patch("domains.chat.llm_client.get_settings") as mock_get_settings,
            patch("infra.llm.provider_factory.ChatLiteLLM"),
        ):
            mock_settings = MagicMock()
            mock_llm_settings = _make_llm_settings("openai", "gpt-4o-mini")
            mock_settings.llm = mock_llm_settings
            mock_get_settings.return_value = mock_settings

            client = get_llm_client()

        assert isinstance(client, LLMClient)

    def test_factory_reads_from_settings_llm(self) -> None:
        """Ensure get_llm_client uses settings.llm, not raw environment vars."""
        with (
            patch("domains.chat.llm_client.get_settings") as mock_get_settings,
            patch("infra.llm.provider_factory.ChatLiteLLM"),
        ):
            mock_settings = MagicMock()
            mock_llm_settings = _make_llm_settings(
                "anthropic",
                "claude-3-5-haiku-20241022",
                anthropic_api_key="test-anthropic-key",  # pragma: allowlist secret
                openai_api_key="",
            )
            mock_settings.llm = mock_llm_settings
            mock_get_settings.return_value = mock_settings

            client = get_llm_client()

        assert client.model_string == "anthropic/claude-3-5-haiku-20241022"
        assert client.provider == "anthropic"

    def test_factory_calls_get_settings(self) -> None:
        with (
            patch("domains.chat.llm_client.get_settings") as mock_get_settings,
            patch("infra.llm.provider_factory.ChatLiteLLM"),
        ):
            mock_settings = MagicMock()
            mock_settings.llm = _make_llm_settings("openai", "gpt-4o-mini")
            mock_get_settings.return_value = mock_settings

            get_llm_client()

        mock_get_settings.assert_called_once()

    def test_factory_is_usable_as_fastapi_depends(self) -> None:
        """get_llm_client must be a plain callable (not async), suitable for Depends()."""
        import inspect

        assert callable(get_llm_client)
        assert not inspect.iscoroutinefunction(get_llm_client), (
            "get_llm_client should be synchronous so FastAPI can call it without await"
        )


# ---------------------------------------------------------------------------
# Provider portability — all providers produce valid model strings
# ---------------------------------------------------------------------------


class TestProviderPortability:
    """Demonstrate that all supported providers produce a correctly configured client."""

    @pytest.mark.parametrize(
        ("provider", "model", "expected_model_string"),
        [
            ("openai", "gpt-4o", "openai/gpt-4o"),
            ("anthropic", "claude-3-5-sonnet-20241022", "anthropic/claude-3-5-sonnet-20241022"),
            ("gemini", "gemini-1.5-flash", "gemini/gemini-1.5-flash"),
            ("ollama", "llama3.2", "ollama/llama3.2"),
            ("azure", "gpt-4o", "azure/gpt-4o"),
        ],
    )
    def test_model_string_for_each_provider(
        self, provider: str, model: str, expected_model_string: str
    ) -> None:
        extra: dict[str, str] = {}
        if provider == "anthropic":
            extra = {
                "openai_api_key": "",
                "anthropic_api_key": "test-anthropic-key",  # pragma: allowlist secret
            }
        elif provider == "gemini":
            extra = {
                "openai_api_key": "",
                "gemini_api_key": "test-gemini-key",  # pragma: allowlist secret
            }
        elif provider == "ollama":
            extra = {"openai_api_key": ""}
        elif provider == "azure":
            extra = {
                "openai_api_key": "",
                "azure_api_key": "test-azure-key",  # pragma: allowlist secret
            }

        with patch("infra.llm.provider_factory.ChatLiteLLM"):
            client = LLMClient(settings=_make_llm_settings(provider, model, **extra))

        assert client.model_string == expected_model_string

    def test_model_string_always_has_provider_prefix(self) -> None:
        """Every provider must prefix its model with '<provider>/'."""
        providers_and_models = [
            ("openai", "gpt-4o"),
            ("anthropic", "claude-3-5-haiku-20241022"),
            ("gemini", "gemini-2.0-flash"),
            ("ollama", "mistral"),
        ]
        for provider, model in providers_and_models:
            extra: dict[str, str] = {}
            if provider != "openai":
                extra["openai_api_key"] = ""
            if provider == "anthropic":
                extra["anthropic_api_key"] = "test-anthropic-key"  # pragma: allowlist secret
            elif provider == "gemini":
                extra["gemini_api_key"] = "test-gemini-key"  # pragma: allowlist secret

            with patch("infra.llm.provider_factory.ChatLiteLLM"):
                client = LLMClient(settings=_make_llm_settings(provider, model, **extra))

            assert client.model_string.startswith(f"{provider}/"), (
                f"Expected model string to start with '{provider}/', got {client.model_string!r}"
            )


# ---------------------------------------------------------------------------
# LLM call logging (S3 — ADR-0009 / plan.md)
# ---------------------------------------------------------------------------


def _capture_create_task() -> tuple[list[Any], Any]:
    """Patch target for ``asyncio.create_task`` that captures the coroutine instead
    of scheduling it, so the test can await it deterministically (fire-and-forget)."""
    captured: list[Any] = []

    def _fake_create_task(coro: Any) -> MagicMock:
        captured.append(coro)
        return MagicMock()

    return captured, _fake_create_task


class TestAInvokeLogging:
    """ainvoke must log success/failure via save_llm_call_log (fire-and-forget)."""

    @pytest.mark.asyncio
    async def test_ainvoke_logs_success(self) -> None:
        expected = AIMessage(
            content="hello there",
            usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        )
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=expected)
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
        ):
            await client.ainvoke([HumanMessage(content="hi")])
            assert len(captured) == 1
            await captured[0]

        mock_save.assert_awaited_once()
        kwargs = mock_save.await_args.kwargs
        assert kwargs["messages"] == [{"role": "user", "content": "hi"}]
        assert kwargs["response"] == "hello there"
        assert kwargs["error"] is None
        assert kwargs["model"] == client.model_string
        assert kwargs["provider"] == client.provider
        assert kwargs["prompt_tokens"] == 10
        assert kwargs["completion_tokens"] == 5
        assert kwargs["latency_ms"] >= 0

    @pytest.mark.asyncio
    async def test_ainvoke_logs_failure_and_reraises(self) -> None:
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
            pytest.raises(RuntimeError, match="boom"),
        ):
            await client.ainvoke([HumanMessage(content="hi")])

        assert len(captured) == 1
        await captured[0]
        mock_save.assert_awaited_once()
        kwargs = mock_save.await_args.kwargs
        assert kwargs["error"] == "boom"
        assert kwargs["response"] is None


class TestAStreamLogging:
    """astream must log success/failure via save_llm_call_log (fire-and-forget)."""

    @pytest.mark.asyncio
    async def test_astream_logs_success(self) -> None:
        chunks = [
            AIMessageChunk(content="Hello"),
            AIMessageChunk(
                content=", world",
                usage_metadata={"input_tokens": 7, "output_tokens": 3, "total_tokens": 10},
            ),
        ]

        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            for chunk in chunks:
                yield chunk

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
        ):
            collected = [c async for c in client.astream([HumanMessage(content="hi")])]
            assert len(captured) == 1
            await captured[0]

        assert collected == ["Hello", ", world"]
        mock_save.assert_awaited_once()
        kwargs = mock_save.await_args.kwargs
        assert kwargs["response"] == "Hello, world"
        assert kwargs["error"] is None
        assert kwargs["prompt_tokens"] == 7
        assert kwargs["completion_tokens"] == 3

    @pytest.mark.asyncio
    async def test_astream_logs_failure_and_reraises(self) -> None:
        async def _boom_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield AIMessageChunk(content="partial")
            raise RuntimeError("provider exploded")

        mock_chat = MagicMock()
        mock_chat.astream = _boom_astream
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
            pytest.raises(RuntimeError, match="provider exploded"),
        ):
            [_ async for _ in client.astream([HumanMessage(content="hi")])]

        assert len(captured) == 1
        await captured[0]
        mock_save.assert_awaited_once()
        kwargs = mock_save.await_args.kwargs
        assert kwargs["error"] == "provider exploded"
        assert kwargs["response"] is None

    @pytest.mark.asyncio
    async def test_astream_logs_cancellation_with_partial_response(self) -> None:
        """취소되면 그때까지 받은 부분 응답 + ``error="cancelled"``로 한 행 남긴다 (task #65).

        ``CancelledError``는 ``BaseException``이라 기존 ``except Exception``이 잡지 못하고
        루프 뒤 기록에도 도달하지 못한다 → 지금은 행이 아예 안 남는다.
        """
        first_chunk_sent = asyncio.Event()

        async def _stalling_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield AIMessageChunk(content="부분")
            first_chunk_sent.set()
            await asyncio.sleep(10)  # 여기 멈춘 사이 소비 태스크가 취소된다
            yield AIMessageChunk(content="도달하지 않음")

        mock_chat = MagicMock()
        mock_chat.astream = _stalling_astream
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
        ):

            async def _consume() -> None:
                async for _ in client.astream([HumanMessage(content="hi")]):
                    pass

            # loop.create_task로 만들어야 위에서 패치한 asyncio.create_task에 걸리지 않는다.
            task = asyncio.get_running_loop().create_task(_consume())
            await first_chunk_sent.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

            assert len(captured) == 1, "취소 시에도 로그 기록이 정확히 한 번 일어나야 한다"
            await captured[0]

        mock_save.assert_awaited_once()
        kwargs = mock_save.await_args.kwargs
        assert kwargs["error"] == "cancelled"
        assert kwargs["response"] == "부분"

    @pytest.mark.asyncio
    async def test_astream_logs_once_on_normal_completion(self) -> None:
        """완주 경로가 취소 처리 추가로 이중 기록되지 않는지 고정한다 (task #65)."""

        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield AIMessageChunk(content="가")
            yield AIMessageChunk(content="나")

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
        ):
            assert [c async for c in client.astream([HumanMessage(content="hi")])] == ["가", "나"]
            assert len(captured) == 1
            await captured[0]

        assert mock_save.await_count == 1
        assert mock_save.await_args.kwargs["error"] is None


class TestModerationDeclineLogging:
    """ADR `260730-070532` — 완화 재시도를 제거했으므로 빈 응답에서도 LLM 호출은 1회고
    로그도 1행이다. 과거에는 재시도 때문에 2행이 남았다."""

    @pytest.mark.asyncio
    async def test_stream_logs_one_row_and_declines_on_empty_response(self) -> None:
        from domains.moderation.service import PROVIDER_DECLINE_MESSAGE, stream_with_retry

        async def _empty_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            for _item in ():
                yield AIMessageChunk(content=str(_item))

        mock_chat = MagicMock()
        mock_chat.astream = _empty_astream
        client, _ = _make_client(mock_chat=mock_chat)

        captured, fake_create_task = _capture_create_task()
        with (
            patch("domains.chat.llm_client.asyncio.create_task", side_effect=fake_create_task),
            patch("domains.chat.llm_client.save_llm_call_log", new=AsyncMock()) as mock_save,
        ):
            chunks = [c async for c in stream_with_retry(client, [HumanMessage(content="hi")])]
            assert len(captured) == 1  # 재시도가 없으므로 1행
            for coro in captured:
                await coro

        assert chunks == [PROVIDER_DECLINE_MESSAGE]
        assert mock_save.await_count == 1


class TestRecordCallNeverBlocksRealCall:
    """A failure in the logging *prep* code (message conversion / contextvar
    reads) must never prevent the real LLM call from succeeding, nor mask the
    real provider error with a logging error (critical fix — ADR-0009)."""

    @pytest.mark.asyncio
    async def test_ainvoke_succeeds_even_if_message_conversion_raises(self) -> None:
        expected = AIMessage(content="ok")
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(return_value=expected)
        client, _ = _make_client(mock_chat=mock_chat)

        with (
            patch(
                "domains.chat.llm_client.convert_to_openai_messages",
                side_effect=ValueError("unsupported content block"),
            ),
            patch("domains.chat.llm_client.asyncio.create_task") as mock_create_task,
        ):
            result = await client.ainvoke([HumanMessage(content="hi")])

        assert result is expected
        mock_create_task.assert_not_called()

    @pytest.mark.asyncio
    async def test_ainvoke_reraises_original_error_not_logging_error(self) -> None:
        mock_chat = AsyncMock()
        mock_chat.ainvoke = AsyncMock(side_effect=RuntimeError("real-provider-error"))
        client, _ = _make_client(mock_chat=mock_chat)

        with (
            patch(
                "domains.chat.llm_client.convert_to_openai_messages",
                side_effect=ValueError("unsupported content block"),
            ),
            patch("domains.chat.llm_client.asyncio.create_task") as mock_create_task,
            pytest.raises(RuntimeError, match="real-provider-error"),
        ):
            await client.ainvoke([HumanMessage(content="hi")])

        mock_create_task.assert_not_called()

    @pytest.mark.asyncio
    async def test_astream_succeeds_even_if_message_conversion_raises(self) -> None:
        async def _fake_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield AIMessageChunk(content="ok")

        mock_chat = MagicMock()
        mock_chat.astream = _fake_astream
        client, _ = _make_client(mock_chat=mock_chat)

        with (
            patch(
                "domains.chat.llm_client.convert_to_openai_messages",
                side_effect=ValueError("unsupported content block"),
            ),
            patch("domains.chat.llm_client.asyncio.create_task") as mock_create_task,
        ):
            collected = [c async for c in client.astream([HumanMessage(content="hi")])]

        assert collected == ["ok"]
        mock_create_task.assert_not_called()

    @pytest.mark.asyncio
    async def test_astream_reraises_original_error_not_logging_error(self) -> None:
        async def _boom_astream(messages: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            raise RuntimeError("real-provider-error")
            yield  # pragma: no cover - makes this an async generator

        mock_chat = MagicMock()
        mock_chat.astream = _boom_astream
        client, _ = _make_client(mock_chat=mock_chat)

        with (
            patch(
                "domains.chat.llm_client.convert_to_openai_messages",
                side_effect=ValueError("unsupported content block"),
            ),
            patch("domains.chat.llm_client.asyncio.create_task") as mock_create_task,
            pytest.raises(RuntimeError, match="real-provider-error"),
        ):
            [_ async for _ in client.astream([HumanMessage(content="hi")])]

        mock_create_task.assert_not_called()
