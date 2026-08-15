# STATUS — 버전 비교 페이지 (2/2): 진입 전환과 모달·선저장 기계장치 철거
slug: version-diff-page-2of2
status: done
executed: 2026-08-12
completed: 2026-08-12
verified: yes (tdd 모드 — 슬라이스 테스트가 증거다: `pnpm test` 54 files / **370 passed** · `pnpm typecheck` 클린 · `pnpm lint` 클린 · 철거 잔존 참조 `grep -rn "VersionHistoryModal\|word-diff\|diffWords\|restoringRef\|restoreVersion" src/` → **0건** · 두 핵심 방어를 제거해 red 확인(S1 ④ `initialBodyRef` 갱신 제거 → 언마운트가 두 번째 PATCH를 쏴 red / S2 ④ `reverting` 가드 제거 → 두 번째 클릭이 통과해 red) · 테스트 순감 9건을 `git stash` 기준선(379)과 파일별로 대조해 전부 의도한 것임을 확인.
retro: skipped (fg-next all 자동 드라이브 — 학습은 run.md에 남고 승급은 추후 fg-learn)
docs updated: none
