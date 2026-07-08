<!-- forge-slug: worktree-add-buttons-restyle -->
<!-- task: 10 -->
<!-- tdd: off -->
<!-- retro-hint: optional -->
# 작업트리 "새 화"·"새 부"를 위계 구분된 버튼으로 변경

## Goal / Non-goals
- Goal: 좌측 작업트리(`work-tree.tsx`)에서 흐릿한 텍스트로 묻혀 보이던 "새 화"·"새 부" 추가 항목을 **명확한 버튼**으로 바꾸고, 둘을 **위계로 구분**해 헷갈리지 않게 한다 — 새 화는 부 아래 들여쓴 작은 고스트/점선 버튼(FilePlus 아이콘), 새 부는 트리 하단 구분선 뒤의 테두리 버튼(FolderPlus 아이콘, 더 굵고 넓게).
- Non-goals: 추가 동작·확인 다이얼로그·라벨 문구 변경(기존 "새 화"/"새 부" 유지)·다른 트리 항목 스타일 변경. 순수 두 버튼의 시각 스타일만.

## Source of truth
- Glossary terms: [[부]], [[화]] in `.forge/branch/feat/web-topbar-landing-nav/CONTEXT.md`
- Related ADRs: none
- Definition of Done: 작업트리에서 "새 화"는 부에 속한 들여쓴 고스트/점선 버튼(FilePlus)으로, "새 부"는 하단 구분선 뒤 테두리 버튼(FolderPlus, 더 굵게)으로 렌더 — 둘이 위치·무게·아이콘으로 명확히 구분되고 흐릿한 텍스트로 보이지 않는다. 클릭 동작(확인 다이얼로그→추가)은 기존 그대로. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 두 버튼이 구분돼 보이는지 육안 확인.

## Work slices
- [ ] S1. `work-tree.tsx`의 "새 화"·"새 부" 버튼 재스타일 — 새 화: 부 chapters 뒤, 들여쓴(`pl-5`) 점선/고스트 버튼 + `FilePlus`, 텍스트 묻힘 탈피(테두리 또는 hover만이 아닌 항상 버튼임이 보이게). 새 부: 트리 맨 아래에 상단 구분선(border-t) + 테두리(`border`) 버튼(full-width, 더 굵게/넓게) + `FolderPlus`. 기존 onClick(`confirmAddChapter`/`confirmAddPart`) 유지 — 완료 기준: playwriter로 새 화(들여쓴 고스트)·새 부(하단 테두리 버튼)가 서로 다르게·또렷이 보임 확인, `pnpm typecheck`·`lint` 통과.

## 비고 (eco)
- 스타일만 변경, 새 컴포넌트·새 의존성 0. lucide `FilePlus`/`FolderPlus`만 추가 import.
