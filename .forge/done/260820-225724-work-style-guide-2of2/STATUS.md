# STATUS — 집필 보조 태스크별 온도 테이블을 둔다
slug: work-style-guide-2of2
status: done
executed: 2026-08-20
completed: 2026-08-20
verified: yes (완료 정의 전부 실측 — ① 8종 등재·키 집합 일치: `set(TASK_TEMPERATURE) == set(TASK_TIER) == set(TaskType)` → True, 값은 창작 5종 0.7 / 결정적 3종 0.2 ② 전달 배선: `ChatLiteLLM` 생성 kwargs까지 도달하는 테스트가 존재하고, 배선을 끊으면 **`assert 1.0 == 0.7`로 red**(표가 아니라 배선을 본다는 증거), 표에서 `summary`를 빼면 2건 red ③ 게이트: **1303 passed · 12 failed(Makefile 기존) · errors 0** · ruff 클린 · mypy 171파일 no issues. 백엔드 테스트 1285 → 1303(+18).
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260820-225538-work-style-guide-2of2.md
docs updated: none
