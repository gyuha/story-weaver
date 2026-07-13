"""llm_call_context contextvar 단위 테스트 (TDD, plan.md S2 / ADR-0009).

바인딩 전에는 user_id·task가 모두 None이고(백그라운드 호출도 로그를 남길 수 있어야
함), 바인딩 후에는 get이 그대로 돌려주는지만 확인한다. 각 테스트는 asyncio_mode=auto로
독립된 asyncio Task에서 실행되므로(``contextvars.Context``가 Task 경계에서 복사됨)
테스트 간 바인딩이 새어나가지 않는다.
"""

from __future__ import annotations

import uuid

from core.llm_call_context import bind_llm_call_context, get_llm_call_context


async def test_get_llm_call_context_returns_none_when_unbound() -> None:
    context = get_llm_call_context()

    assert context.user_id is None
    assert context.task is None


async def test_bind_llm_call_context_sets_user_id_and_task() -> None:
    user_id = uuid.uuid4()

    bind_llm_call_context(user_id=user_id, task="assist.continue")
    context = get_llm_call_context()

    assert context.user_id == user_id
    assert context.task == "assist.continue"
