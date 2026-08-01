"""Unit tests for the assist domain's model tier routing (ai-pipeline.md §4.1).

Verifies:
* Each of the 5 writing-assist task types maps to its documented tier
  (continue/infill/correct = low_cost, dialogue/style = high_quality).
* ``get_client_for_tier`` actually branches on tier (dict-dispatch, not a
  no-op) and resolves both tiers to a working LLM client — even though both
  currently resolve to the same underlying provider/model.

All tests are pure unit tests — the chat domain's LLM factory is stubbed so
no network call is made and no real settings are required.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages.ai import AIMessage

from domains.assist.tier_routing import (
    TASK_TIER,
    TaskType,
    Tier,
    get_client_for_tier,
    get_fast_writing_client,
)
from domains.chat.ports import LLMClientFactoryProtocol, LLMClientProtocol

# ---------------------------------------------------------------------------
# task_type -> tier mapping (ai-pipeline.md §4.1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("task_type", "expected_tier"),
    [
        (TaskType.continue_, Tier.low_cost),
        (TaskType.infill, Tier.low_cost),
        (TaskType.correct, Tier.low_cost),
        (TaskType.dialogue, Tier.high_quality),
        (TaskType.style, Tier.high_quality),
        (TaskType.title_, Tier.low_cost),
    ],
)
def test_task_type_maps_to_documented_tier(task_type: TaskType, expected_tier: Tier) -> None:
    assert TASK_TIER[task_type] is expected_tier


def test_all_task_types_are_mapped() -> None:
    assert set(TASK_TIER) == set(TaskType)


# ---------------------------------------------------------------------------
# tier -> client dispatch (must be a real branch, not a no-op)
# ---------------------------------------------------------------------------


class _StubLLMClient:
    """Minimal ``LLMClientProtocol`` satisfier — no network calls."""

    async def ainvoke(self, messages: list[Any], **kwargs: Any) -> AIMessage:
        return AIMessage(content="stub")

    async def astream(self, messages: list[Any], **kwargs: Any) -> Any:
        yield "stub"


class _StubFactory:
    def __init__(self, client: LLMClientProtocol) -> None:
        self._client = client

    def get_llm_client(self) -> LLMClientProtocol:
        return self._client


def test_get_client_for_tier_branches_per_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    """Both tiers must go through independent dispatch entries, not one shared call."""
    low_cost_client = _StubLLMClient()
    high_quality_client = _StubLLMClient()
    calls: list[Tier] = []

    def _fake_get_llm_factory_for(tier: Tier) -> LLMClientFactoryProtocol:
        calls.append(tier)
        client = low_cost_client if tier is Tier.low_cost else high_quality_client
        return _StubFactory(client)

    monkeypatch.setattr(
        "domains.assist.tier_routing._TIER_FACTORY_GETTERS",
        {
            Tier.low_cost: lambda: _fake_get_llm_factory_for(Tier.low_cost),
            Tier.high_quality: lambda: _fake_get_llm_factory_for(Tier.high_quality),
        },
    )

    resolved_low_cost = get_client_for_tier(Tier.low_cost)
    resolved_high_quality = get_client_for_tier(Tier.high_quality)

    assert resolved_low_cost is low_cost_client
    assert resolved_high_quality is high_quality_client
    assert calls == [Tier.low_cost, Tier.high_quality]


def test_get_client_for_tier_returns_protocol_satisfying_client() -> None:
    """End-to-end (no stubbing of the routing module): both tiers resolve to a
    real, protocol-satisfying client. ``ChatLiteLLM`` itself is patched so no
    network call or real API key is needed — consistent with tests/chat/*.
    """
    with patch("infra.llm.provider_factory.ChatLiteLLM"):
        for tier in Tier:
            client = get_client_for_tier(tier)
            assert isinstance(client, LLMClientProtocol)


def test_get_client_for_tier_rejects_unknown_tier() -> None:
    with pytest.raises(KeyError):
        get_client_for_tier(MagicMock())


# ---------------------------------------------------------------------------
# get_fast_writing_client — 지연에 민감한 assist 태스크를 분리하는 seam
# ---------------------------------------------------------------------------


def test_get_fast_writing_client_returns_protocol_satisfying_client() -> None:
    """``ChatLiteLLM``을 패치해 네트워크 호출 없이 프로토콜 충족만 확인한다."""
    with patch("infra.llm.provider_factory.ChatLiteLLM"):
        client = get_fast_writing_client()
        assert isinstance(client, LLMClientProtocol)


def test_get_fast_writing_client_sends_no_provider_specific_params() -> None:
    """z.ai 전용 ``thinking`` 파라미터가 남아 있지 않은지 고정한다(task #63).

    현재 프로바이더는 그 키를 조용히 무시하므로 남겨두면 "동작하는 설정"으로 오독된다.
    """
    with patch("infra.llm.provider_factory.ChatLiteLLM") as mock_chat_litellm:
        get_fast_writing_client()
        _, kwargs = mock_chat_litellm.call_args
        assert "thinking" not in str(kwargs)
        assert kwargs.get("model_kwargs") in (None, {})
