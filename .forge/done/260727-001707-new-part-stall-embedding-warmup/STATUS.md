# STATUS — 새 부 생성이 처음에 멈추는 문제: 임베딩 모델 워밍업 + 빈 본문 임베딩 차단
slug: new-part-stall-embedding-warmup
status: done
executed: 2026-07-26
completed: 2026-07-27
verified: yes (2026-07-26 재시작 직후 육안 UAT 4항목 통과 — 워밍업 로그 started/completed 2줄, 워밍업 완료 전에도 새 부 1초 내 생성·연타 시 부 1개, 메모리 패널 첫 오픈 지연 없음, 워밍업 중 코드 저장 시 리로드 지연 없음. DB 확인: 빈 본문 chapters 3건에 embeddings 0행, content='' 0행. 게이트: api ruff+mypy(159파일) clean·pytest 925 passed/커버리지 79.71%(기존 무관 실패 12건은 Makefile 부재 — run.md 참조), web typecheck·lint clean·test 47파일 242건)
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260727-000846-new-part-stall-embedding-warmup.md
docs updated: none
