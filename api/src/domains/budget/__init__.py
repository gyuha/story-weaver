"""budget 도메인 — 사용자별 누적 토큰(비용) 사용량 카운터 (plan.md M4-S1).

집필 보조(``assist``)·동적 업데이트(``dynamic_update``)의 LLM 호출이 끝난 뒤
사용량을 기록해 두면, 이후 작업(S2 budget 게이트)이 상한 초과를 검사할 수 있다.
"""
