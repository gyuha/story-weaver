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
    """The writing-assist operations (ai-pipeline.md §3.1).

    ``title`` was added per ADR-0012, ``summary`` per task #67, ``draft`` per task #69.
    """

    continue_ = "continue"
    infill = "infill"
    dialogue = "dialogue"
    style = "style"
    correct = "correct"
    # ``title``은 ``str.title`` 메서드와 충돌 → ``continue_``처럼 밑줄 접미사(값은 "title").
    title_ = "title"
    summary = "summary"
    #: 요약을 근거로 화 본문을 쓴다(늘려쓰기). `continue_`와 방향이 반대다 —
    #: 이어쓰기는 본문 → 다음 전개 후보, 늘려쓰기는 요약 → 원고.
    draft = "draft"


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
    TaskType.summary: Tier.low_cost,
    # 원고를 대신 쓰는 작업이라 품질이 가장 중요하다.
    TaskType.draft: Tier.high_quality,
}

#: task_type → sampling temperature (assist 전용, 티어와 다른 축 — task 85).
#: 창작 계열(이어쓰기·인필링·대사변환·문체변환·늘려쓰기)은 0.7, 결정적 계열
#: (교정·제목·요약)은 0.2. **이 값은 받은 조언과 통념에 기댄 것이고 이 저장소에서
#: 실측한 값이 아니다** — 문체가 실제로 덜 흔들리는지는 같은 프롬프트를 여러 온도로
#: 여러 번 돌려 비교해야 알 수 있고, 그 측정은 이번 범위 밖이다.
TASK_TEMPERATURE: dict[TaskType, float] = {
    TaskType.continue_: 0.7,
    TaskType.infill: 0.7,
    TaskType.dialogue: 0.7,
    TaskType.style: 0.7,
    TaskType.draft: 0.7,
    TaskType.correct: 0.2,
    TaskType.title_: 0.2,
    TaskType.summary: 0.2,
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


def get_fast_writing_client(task: TaskType | None = None) -> AbstractLLMPort:
    """집필 보조 작업(이어쓰기·인필링·대사변환·문체변환·교정·제목) 전용 클라이언트.

    이 작업들은 짧은 창작 보조라 깊은 추론보다 **응답 속도**가 더 중요하다. 그래서
    ``TASK_TIER``를 의도적으로 우회하는 seam으로 남긴다 — 표는 ``dialogue``·``style``을
    ``high_quality``로 규정하지만 이 경로는 지연을 줄이는 쪽을 택한다. 나중에 진짜
    고품질 모델을 배선하는 순간, 이 seam이 없으면 그 태스크들이 조용히 느려지거나
    비싸진다.

    **모델 선택은 현재 기본 클라이언트와 동일하다** — 실제 프로바이더가 하나뿐이라(
    ``_TIER_FACTORY_GETTERS``의 두 티어가 같은 팩토리) 분기할 대상이 없다. 빠른
    모델을 실제로 붙일 때 여기만 고치면 된다. 다른 도메인
    (dynamic_update/works beat-sheet/relationships)이 쓰는 :func:`get_client_for_tier`는
    영향받지 않는다.

    ``task``가 주어지면 ``TASK_TEMPERATURE`` 값을 요청별 override로 실어 보낸다
    (task 85 S1). ``task``가 ``None``이면 온도를 override하지 않고 전역
    ``LLM_TEMPERATURE``를 그대로 쓴다 — assist 도메인 바깥의 호출부(예:
    ``manuscript_router``의 기획의도 이어쓰기)는 이번 작업의 범위 밖이라 그대로 둔다.

    Parameters
    ----------
    task:
        호출하는 assist 태스크. 주어지면 ``TASK_TEMPERATURE[task]``를 온도로 쓴다.
    """
    if task is None:
        return LLMClient()
    return LLMClient(temperature=TASK_TEMPERATURE[task])
