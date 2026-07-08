# run.md — 작업트리 "새 화"·"새 부" 버튼 위계 구분

실행일: 2026-06-25 · 슬러그: worktree-add-buttons-restyle · task #10
규모 작아 직접 실행. eco on.

## 계획대로 된 것
- **S1** `work-tree.tsx` 두 추가 버튼 재스타일: 새 화 = 부 아래 들여쓴(`ml-6`) 점선 고스트 버튼 + `FilePlus`. 새 부 = 트리 하단 구분선(`border-t`) 뒤 테두리 버튼(full-width, h-9, font-semibold) + `FolderPlus`. 흐릿한 텍스트 탈피, 위치·무게·아이콘 3중 구분. onClick(확인 다이얼로그) 유지. lucide `Plus`→`FilePlus`/`FolderPlus` 교체.
- typecheck·lint 통과. playwriter로 두 버튼이 또렷이·서로 다르게 보임 육안 확인.

## 계획과 달랐던 것
- 거의 없음(분기 낮음). 계획대로 스타일만 변경.

## Non-goals 준수
- 동작·라벨·다른 트리 항목 손대지 않음.

## 코드 리뷰
- 스타일 변경, 저위험 → 생략.
