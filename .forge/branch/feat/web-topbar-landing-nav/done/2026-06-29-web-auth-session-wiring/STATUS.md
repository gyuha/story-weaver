# STATUS — API 실연동 part 1: auth 세션 배선 (web)
slug: web-auth-session-wiring
status: done
executed: 2026-06-29
completed: 2026-06-29
verified: yes (vitest 19/19 + typecheck·lint clean; playwriter: 미인증 /works→/auth/login redirect, 잘못된 자격증명 에러 표시·비이동; UAT서 발견한 /works 인덱스 미가드를 requireAuth로 in-run 수정; 적대적 리뷰가 401 무한루프 HIGH 버그 수정. 로컬 백엔드 미가동이라 로그인 happy-path는 테스트 커버)
retro: skipped (fg-next all 자동 진행 — 학습은 run.md, 승급은 추후 fg-learn)
docs updated: ADR-0007 추가; 루트 CLAUDE.md web 섹션(vitest 도입 반영)
