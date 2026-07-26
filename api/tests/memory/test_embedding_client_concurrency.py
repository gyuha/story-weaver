"""``_get_model`` 동시 호출 시 스레드 안전성 테스트 (TDD, plan.md S2).

``lru_cache``는 캐시 미스 시 사용자 함수 호출을 락 밖에서 실행하므로, 워밍업 태스크와
실제 요청이 동시에 최초 호출을 하면 ``SentenceTransformer`` 생성자가 2회 이상 불릴 수
있다(메모리 2배 + 시간 2배). 더블체크 락킹으로 생성자가 정확히 1회만 불리는지 검증한다
— 기존 ``test_embedding_client.py``(실 모델 계약 테스트)는 손대지 않는다.
"""

from __future__ import annotations

import threading
import time

import pytest

import domains.memory.embedding_client as embedding_client_module


def test_get_model_constructs_once_under_concurrent_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    calls_lock = threading.Lock()

    class _FakeModel:
        pass

    def _fake_constructor(_model_name: str) -> _FakeModel:
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)  # 동시 진입 창을 넓혀 락 없이는 반드시 레이스가 드러나게 함
        return _FakeModel()

    monkeypatch.setattr(embedding_client_module, "_model", None, raising=False)
    monkeypatch.setattr(embedding_client_module, "SentenceTransformer", _fake_constructor)

    barrier = threading.Barrier(8)

    def _call_get_model() -> None:
        barrier.wait()
        embedding_client_module._get_model()

    threads = [threading.Thread(target=_call_get_model) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert calls == 1
