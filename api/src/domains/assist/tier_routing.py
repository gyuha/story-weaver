"""Model tier routing for the assist domain (ai-pipeline.md §4.1).

Maps each writing-assist task type to a model quality tier
(``low_cost`` / ``high_quality``) and resolves a tier to a concrete LLM
client via the chat domain's ``ProviderFactory``-backed client factory
(:mod:`domains.chat.container`).

Only one real provider/model exists today (``LLM_PROVIDER=openai_compatible``,
z.ai GLM-4.6), so both tiers currently resolve to the same client. The
tier → factory-getter dispatch below is still a real per-tier branch (dict
lookup, not a shared no-op call) — wiring in a second model later means
pointing one entry of ``_TIER_FACTORY_GETTERS`` at a different getter.

Usage::

    from domains.assist.tier_routing import TaskType, TASK_TIER, get_client_for_tier

    tier = TASK_TIER[TaskType.dialogue]  # Tier.high_quality
    client = get_client_for_tier(tier)   # LLMClientProtocol
    response = await client.ainvoke(messages)
"""

from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum

from domains.chat.container import get_llm_factory
from domains.chat.llm_client import LLMClient
from domains.chat.ports import AbstractLLMPort, LLMClientFactoryProtocol


class TaskType(StrEnum):
    """The 5 writing-assist operations (ai-pipeline.md §3.1)."""

    continue_ = "continue"
    infill = "infill"
    dialogue = "dialogue"
    style = "style"
    correct = "correct"


class Tier(StrEnum):
    """Model quality tier (ai-pipeline.md §4.1)."""

    low_cost = "low_cost"
    high_quality = "high_quality"


#: task_type → tier mapping table (ai-pipeline.md §4.1).
TASK_TIER: dict[TaskType, Tier] = {
    TaskType.continue_: Tier.low_cost,
    TaskType.infill: Tier.low_cost,
    TaskType.correct: Tier.low_cost,
    TaskType.dialogue: Tier.high_quality,
    TaskType.style: Tier.high_quality,
}

#: tier → factory-getter dispatch. Both tiers use the chat domain's default
#: factory today; point either entry at a different getter once a second
#: model/provider exists.
# eco: single real provider today — both entries intentionally identical.
_TIER_FACTORY_GETTERS: dict[Tier, Callable[[], LLMClientFactoryProtocol]] = {
    Tier.low_cost: get_llm_factory,
    Tier.high_quality: get_llm_factory,
}


def get_client_for_tier(tier: Tier) -> AbstractLLMPort:
    """Return the LLM client configured for the given quality tier.

    Parameters
    ----------
    tier:
        The quality tier to resolve, typically looked up via ``TASK_TIER``.

    Returns
    -------
    AbstractLLMPort
        A client obtained from the tier's registered
        :class:`~domains.chat.ports.LLMClientFactoryProtocol`.

    Raises
    ------
    KeyError
        If *tier* is not a registered :class:`Tier` member.
    """
    factory = _TIER_FACTORY_GETTERS[tier]()
    return factory.get_llm_client()


def get_fast_writing_client() -> AbstractLLMPort:
    """5개 집필 보조 작업(이어쓰기·인필링·대사변환·문체변환·교정) 전용 클라이언트.

    z.ai GLM-4.6은 기본적으로 확장 추론(thinking) 모드로 동작해, 응답에 쓰이지
    않는 추론 토큰을 수백~1000개 이상 태우고 응답을 5배 가까이 느리게 만든다
    (실측: thinking 켜짐 46~67초 → ``extra_body={"thinking": {"type": "disabled"}}``로
    끄면 9~12초, 생성된 문장 품질 차이는 없었음). 이 5작업은 짧은 창작 보조라 깊은
    추론보다 응답 속도가 더 중요해 여기서만 끈다 — 다른 도메인
    (dynamic_update/works beat-sheet/relationships)이 쓰는 :func:`get_client_for_tier`는
    영향받지 않는다.
    """
    return LLMClient(model_kwargs={"extra_body": {"thinking": {"type": "disabled"}}})
