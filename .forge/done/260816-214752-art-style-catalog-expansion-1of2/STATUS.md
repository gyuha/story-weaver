# STATUS — 작품 화풍 카탈로그를 14종으로 늘리고 목록을 2열 그리드로 바꾼다
slug: art-style-catalog-expansion-1of2
status: done
executed: 2026-08-16
completed: 2026-08-16
verified: yes (DoD 4항목 전부 실측 확인 — ① `templates.json`의 `styles` 14개(`json.load` 후 개수·id 출력) ② 실 API `curl localhost:8000/api/v1/art-styles` → **14건**, id가 확정 목록과 일치 ③ 브라우저(aside-browser로 `/works/{workId}/art-style` 탭 attach)에서 화풍 **14개**가 `display: grid` · `gridTemplateColumns: "364px 364px"` · `perRow [2,2,2,2,2,2,2]` · 7행으로 렌더되고, 기존 4종은 견본 3장·새 10종은 🖼️ 플레이스홀더(계획이 예고한 중간 상태) ④ 게이트: `pytest` **1207 passed · 12 failed(Makefile 부재 기존 무관, 계획이 예고한 동일 집합) · errors 0** · `ruff` 클린 · `mypy src` **171파일 no issues** · `pnpm typecheck`/`lint` 클린 · `pnpm test` **56 files / 395 passed**.
retro: skipped (fg-next all 자동 드라이브 — 학습은 run.md에 남기고 승급은 나중 fg-learn으로 미룬다)
docs updated: none
