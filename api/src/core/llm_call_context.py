"""LLM 호출 로그 컨텍스트 contextvar (ADR-0009 / plan.md S2).

5개 도메인(assist·chat·dynamic_update·works·relationships) 라우터가 이미 가진
``current_user``로부터 user_id·작업종류(task, 예: ``"assist.continue"``)를 요청
스코프에 바인딩한다. S3의 ``LLMClient``가 :func:`get_llm_call_context`로 읽어
``llm_call_logs``에 채운다. ``correlation_id``는 기존 structlog contextvars
(``core/middleware.py``)에서 별도로 읽으므로 여기서 다루지 않는다. 바인딩이 없는
호출(백그라운드 등)은 둘 다 ``None``으로 남아도 로그는 저장된다(nullable).
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class LLMCallContext:
    user_id: uuid.UUID | None
    task: str | None


#: ContextVar 기본값은 불변 데이터 구조라도 공유 인스턴스라 ruff(B039)가 금지한다 —
#: ``None``을 기본값으로 두고 get에서 빈 컨텍스트를 새로 만들어 반환한다.
_context_var: ContextVar[LLMCallContext | None] = ContextVar("llm_call_context", default=None)


def bind_llm_call_context(*, user_id: uuid.UUID | None, task: str | None) -> None:
    """현재 컨텍스트(요청 등)에 user_id·task를 바인딩한다."""
    _context_var.set(LLMCallContext(user_id=user_id, task=task))


def get_llm_call_context() -> LLMCallContext:
    """바인딩된 값을 반환한다(바인딩 없으면 둘 다 ``None``)."""
    return _context_var.get() or LLMCallContext(user_id=None, task=None)
