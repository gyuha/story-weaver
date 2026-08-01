"""Model tier routing for the assist domain (ai-pipeline.md §4.1).

Maps each writing-assist task type to a model quality tier
(``low_cost`` / ``high_quality``) and resolves a tier to a concrete LLM
client via the chat domain's ``ProviderFactory``-backed client factory
(:mod:`domains.chat.container`).

Only one real provider/model is configured today, so both tiers currently
resolve to the same client. The tier → factory-getter dispatch below is still a
real per-tier branch (dict lookup, not a shared no-op call) — wiring in a second
model later means pointing one entry of ``_TIER_FACTORY_GETTERS`` at a different
getter.

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
    """The writing-assist operations (ai-pipeline.md §3.1; ``title`` added per ADR-0012)."""

    continue_ = "continue"
    infill = "infill"
    dialogue = "dialogue"
    style = "style"
    correct = "correct"
    # ``title``은 ``str.title`` 메서드와 충돌 → ``continue_``처럼 밑줄 접미사(값은 "title").
    title_ = "title"


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
    TaskType.title_: Tier.low_cost,
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
    """집필 보조 작업(이어쓰기·인필링·대사변환·문체변환·교정·제목) 전용 클라이언트.

    이 작업들은 짧은 창작 보조라 깊은 추론보다 **응답 속도**가 더 중요하다. 그래서
    ``TASK_TIER``를 의도적으로 우회하는 seam으로 남긴다 — 표는 ``dialogue``·``style``을
    ``high_quality``로 규정하지만 이 경로는 지연을 줄이는 쪽을 택한다. 나중에 진짜
    고품질 모델을 배선하는 순간, 이 seam이 없으면 그 태스크들이 조용히 느려지거나
    비싸진다.

    **현재는 기본 클라이언트와 동일하다** — 실제 프로바이더가 하나뿐이라(
    ``_TIER_FACTORY_GETTERS``의 두 티어가 같은 팩토리) 분기할 대상이 없다. 빠른
    모델을 실제로 붙일 때 여기만 고치면 된다. 다른 도메인
    (dynamic_update/works beat-sheet/relationships)이 쓰는 :func:`get_client_for_tier`는
    영향받지 않는다.
    """
    return LLMClient()
