<!-- forge-slug: works-dashboard-revamp -->
<!-- task: 5 -->
<!-- tdd: off -->
# 작품 목록(/works) 대시보드 — 사이드바 제거 + 활동/추천 항목 추가

## Goal / Non-goals
- Goal: `/works` 대시보드에서 좌측 사이드바(AppShell의 SidebarShell)를 제거하고 full-width로 재구성한다. 상단을 2칸으로 — 좌: "이어서 쓰기" CTA + 요약 통계(총 작품·총 집필량·연재 중), 우: 이번 달 AI 사용량 카드 + 검토 필요 카드 — 그 아래 기존 작품 그리드(WorkCard + NewWorkCard). 모든 표시 항목은 기존 mock 데이터로 산출.
- Non-goals:
  - 새 데이터 모델/필드 추가 없음 — "이어서 쓰기"는 마지막 편집 씬을 추적하지 않고 `works[0]`(가장 최근) + `/works/$workId/write`(기본 씬으로 리다이렉트)로 연결. 배너 문구는 작품 제목 + `lastEditedLabel`(가용 데이터)로 표기.
  - 작업 내부 화면(편집/읽기 등 WorkShell)의 작업트리 사이드바는 그대로 — 이번 변경은 대시보드(AppShell)에만 적용.
  - 실 API 연결 없음(mock 단계). 검토 필요 클릭 시 상세 이동 등 신규 동선은 비목표(표시만).
  - 페이지 헤더 명칭은 "내 작품" 유지(프로필 메뉴 "내 서재"와의 라벨 통일은 별건).

## Source of truth
- Glossary terms: [[작품 (Work)]] in .forge/CONTEXT.md (변경 없음 — 대시보드/항목은 구현 세부, 신규 용어 없음).
- Related ADRs: none.
- Definition of Done: `/works`가 좌측 사이드바 없이 렌더되고, 상단 좌(이어서 쓰기+요약 통계)/우(AI 사용량+검토 필요) 카드 + 하단 작품 그리드가 표시되며, "집필 계속"이 가장 최근 작품의 집필 화면으로 이동한다. `pnpm typecheck`·`pnpm lint`·`pnpm build` green + playwriter UAT 통과.

## Work slices
- [ ] S1. 사이드바 제거 — `AppShell`(대시보드 전용 셸)에서 `SidebarShell`·`WorkspaceHeader`·작품 목록 링크를 들어내고 TopBar + full-width 콘텐츠 영역으로 단순화. 사이드바 제거로 끊긴 import/코드 정리. — completion criterion: `/works`에 좌측 사이드바가 없고 콘텐츠가 전체 폭 사용(playwriter). (UsageCard는 S3에서 재배치)
- [ ] S2. 집계 산출 — 화면(또는 selector)에서 총 작품 수(`works.length`), 총 집필량(각 `stats.words` parseFloat 합 + 만자), 연재 중 수(`status === '연재 중'`), 검토 필요(각 `reviewSummary.conflicts` 합), 이번 달 AI 사용%(`usage.usedTokens/totalTokens`)를 계산. — completion criterion: 표시 값이 mock 데이터와 일치(육안/playwriter). (depends: S1)
- [ ] S3. 상단 카드 영역 — 좌측: "이어서 쓰기" 카드(`works[0]` 제목 + `lastEditedLabel`, [집필 계속 →] → `/works/$workId/write` params=works[0].id) + 요약 통계(작품·만자·연재) 인라인. 우측: 이번 달 AI 사용량 카드(기존 `UsageCard` 로직 재사용/이전) + 검토 필요 카드. 2칸 그리드(좁은 화면은 1칸 스택). — completion criterion: "집필 계속" 클릭 → 집필 화면 이동, AI%·검토 수 표시(playwriter). (depends: S2)
- [ ] S4. 다듬기·검증 — 헤더(제목·메타·새 작품 버튼)와 카드 영역·그리드의 간격·정렬을 정돈, 기존 디자인 토큰 사용. — completion criterion: 종합 playwriter UAT(사이드바 없음·상단 4항목·이어쓰기 이동·작품 그리드 정상) + `pnpm typecheck`·`pnpm lint`·`pnpm build` green. (depends: S3)
