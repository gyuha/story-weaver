"""예약 state_key 사전 + 모순 판정 규칙 단위 테스트 (S1, DB 불필요, 순수 함수)."""

from __future__ import annotations

from domains.conflicts.rules import RESERVED_STATE_KEYS, is_contradiction


def test_life_status_is_reserved_with_alive_dead_values() -> None:
    assert RESERVED_STATE_KEYS["life_status"] == frozenset({"alive", "dead"})


def test_dead_then_alive_is_a_contradiction() -> None:
    """ "3화 사망 → 10화 등장" 패턴 — 죽은 뒤 되돌아오면 모순."""
    assert is_contradiction("life_status", "dead", "alive") is True


def test_dead_then_still_dead_is_not_a_contradiction() -> None:
    """죽은 채로 유지되는 것은 모순이 아니다."""
    assert is_contradiction("life_status", "dead", "dead") is False


def test_alive_then_dead_is_not_a_contradiction() -> None:
    """사망 자체는 모순이 아니다 — 사망 '이후' 되돌아오는 것만 모순."""
    assert is_contradiction("life_status", "alive", "dead") is False


def test_non_reserved_key_is_never_a_contradiction() -> None:
    assert is_contradiction("location", "북부", "남부") is False
