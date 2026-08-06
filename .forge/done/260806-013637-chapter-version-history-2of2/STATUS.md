# STATUS — 화 버전 기록 (2/2): 죽은 모달을 실 API에 배선하고 되돌리기를 만든다
slug: chapter-version-history-2of2
status: done
executed: 2026-08-06
completed: 2026-08-06
verified: yes (web typecheck 0 · lint clean(227 files) · 370 passed (52 files) + **실 브라우저 UAT** — playwriter MCP가 없어 머신에 캐시된 Python playwright/chromium으로 앱 자체 `create_access_token` 토큰을 `localStorage['sw-auth-v3']`에 주입해 수행. 임시 작품에서 전 흐름 확인: 시드 45 → 미저장분 타이핑 → `이 버전으로 되돌리기` → `chapter_versions` 47행(=45+선저장+복원), 최신-1이 타이핑한 미저장분(유실 없음), 최신-0 == `chapters.body`(불변식 True). `더 보기` 30→45 누적·중복 없음, 자정 경계 그룹(`오늘 00:12`/`어제 23:32`) 라이브 확인, 보조 문구 `h-14`에서 줄바꿈 없음, 콘솔 에러 0. 사용자 실제 원고는 읽기 전용으로만 열었고(타이핑·저장·되돌리기 안 함) 임시 작품은 삭제 — 고아 버전 0, `오래살자` 6개 화 무변경 확인. 미확정: ④ 그룹 헤더 sticky(스크롤 셀렉터가 패널을 못 잡음 — 요구사항이 아니라 UAT 결정 항목)와 ②③⑤의 미감 판단은 다듬기 후보로 남김)
retro: skipped (fg-next all 자동 진행 — 학습은 run.md, 승급은 추후 fg-learn)
docs updated: none (CONTEXT.md·ADR은 #72에서 갱신)
