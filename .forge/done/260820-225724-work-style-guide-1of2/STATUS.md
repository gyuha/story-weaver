# STATUS — 작품에 문체 지침(style_note)을 두고 생성 프롬프트 4곳에 주입한다
slug: work-style-guide-1of2
status: done
executed: 2026-08-20
completed: 2026-08-20
verified: yes (완료 정의 4항목을 실 스택으로 확인 — ① 시놉시스 화면에서 저장·재조회: QA 작품 실 API `PATCH`→`GET` 왕복이 값을 그대로 반환 ② 프롬프트 4경로 주입: `llm_call_logs`에서 **대조군까지 관측** — 같은 작품·같은 엔드포인트인데 지침 설정 전(12:51:19) 미포함 / 후(12:55:35) 포함 ③ 비면 미주입: S4가 조건 분기를 제거해 **17 failed** red 확인(`'문체 지침: None'`이 새는 것을 잡는다), 원복 후 green ④ 게이트: 백엔드 **1285 passed · 12 failed(Makefile 기존) · errors 0** · ruff 클린 · mypy 171파일 no issues · 프론트 typecheck·lint 클린 · **398 passed** · `alembic current` = `0007_work_style_note (head)`(스위트 실행 후에도 유지).
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260820-225537-work-style-guide-1of2.md
docs updated: CLAUDE.md — 검증을 서브에이전트에 위임할 때(확인 수단 명시·대조 요구)
