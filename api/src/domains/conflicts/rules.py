"""예약 state_key 사전과 모순 판정 규칙 (data-model.md 4.1/8장 — ``life_status`` 예시).

이 슬라이스는 시점 역행 모순을 탐지할 최소 한 개의 예약 키만 정의한다: ``life_status``.
"한 번 죽으면 계속 죽어있어야" 하는 단조 상태라 ``dead`` 뒤에 ``dead``가 아닌 값이 나중
시점(global_seq)에 기록되면 모순("3화 사망 → 10화 등장")이고, ``dead`` 뒤에 다시 ``dead``는
모순이 아니다(그대로 죽어있음). 새 예약 키가 필요해지면 이 사전에 값 집합을 추가하고
``is_contradiction``에 분기를 더한다(v2 후속 — 지금은 1개로 충분, YAGNI).
"""

from __future__ import annotations

RESERVED_STATE_KEYS: dict[str, frozenset[str]] = {
    "life_status": frozenset({"alive", "dead"}),
}


def is_contradiction(state_key: str, earlier_value: str, later_value: str) -> bool:
    """``earlier_value`` 뒤에 오는(더 큰 global_seq) ``later_value``가 시점 역행 모순인지 판정.

    예약 키가 아니면 항상 ``False``.
    """
    if state_key == "life_status":
        return earlier_value == "dead" and later_value != "dead"
    return False
