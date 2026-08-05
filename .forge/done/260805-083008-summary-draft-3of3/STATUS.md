# STATUS — 늘려쓰기 (3/3) 요약으로 본문을 쓰고 화에 반영
slug: summary-draft-3of3
status: done
executed: 2026-08-05
completed: 2026-08-05
verified: yes (2026-08-05 브라우저 UAT — 사용자 확인 "현재 정상 동작 함": 요약 모달 → `요약으로 본문 작성` → 확인창이 요약 모달 위에 뜸 → 확인 시 두 창 닫힘 → `AI로 작성 중` → 완료 시 본문 일괄 교체·다이얼로그 닫힘, 실행 취소 1번 복구. 실측 2건: 실제 TipTap `setContent`→`undo()` 한 번에 원문 복귀(before/restored 일치, canUndo true), `assist.api.ts:202`의 `stop()`이 abort→finally에서 isStreaming을 내려 완료 전이를 만든다(부분 생성물 덮어쓰기 버그의 근거). 게이트: web typecheck·lint clean(224 files)·342 passed(50 files). 방어 7개를 각각 제거해 red 확인, `|| draftingBody` 1개는 초록이라 도달 불가로 판정하고 제거)
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260805-083512-summary-draft-3of3.md
docs updated: CONTEXT.md 늘려쓰기 항목(UI 레이블 명기) · ADR-260805-082723 · 훅 6번 항목
