# run — 작품 목록(/works) 대시보드 사이드바 제거 + 활동/추천 항목

실행: 2026-06-21 / 방식: 워크플로우 없이 단일 에이전트 직접 순차 실행(단일 화면 결합).

## 계획대로 된 것
- S1. 사이드바 제거 — `AppShell`을 TopBar + 전체 폭 콘텐츠로 단순화(SidebarShell·WorkspaceHeader·작품 목록·COVER_DOT·useWorks 제거). UAT: /works에 `<aside>` 0개 확인.
- S2. 집계 — 총 작품(3)·총 집필량(16.3만자)·연재 중(1)·검토 필요(conflicts 합 1)·AI(64%). UAT로 값 일치 확인.
- S3. 상단 카드 — 좌: "이어서 쓰기"(works[0]=검을 거꾸로 쥔 회귀자 + lastEditedLabel, [집필 계속]→/works/hoegwija/write) + 요약 통계 인라인 / 우: 이 달 AI 생성 카드 + 검토 필요 카드. UAT: 집필 계속→/works/hoegwija/write/ch7-s2 이동·에디터 렌더.
- S4. 다듬기 — max-w-[1180px] 중앙 정렬, 카드 12px 라운드·기존 토큰 사용, lg 2:1 그리드(좁은 화면 스택).

## 계획과의 차이 / 현장 결정
- **총 집필량 천자 정규화**: 작품3(만년삼)이 `wordsUnit: '천자'`(8천자)라 단순 parseFloat 합이면 만자/천자가 섞임. `toManja()`로 천자는 /10 정규화 → 12.4+3.1+0.8=16.3만자. (계획의 "parseFloat 합 + 만자"를 정확히 구현하며 단위 혼용을 처리.)
- **UsageCard 제거**: 사이드바 제거로 `sidebar-parts.tsx`의 `UsageCard`가 호출처 없는 orphan이 됨 → 내 변경이 만든 orphan이라 제거하고 useUsage import 정리. AI 사용량 로직은 대시보드 카드로 이전(재구현).
- 검토 필요 카드: conflicts 0이면 "검토할 충돌 없음"으로 표시(빈 상태 처리).
- 이어서 쓰기: 마지막 편집 '씬'은 추적 안 함(비목표) → /works/$workId/write 리다이렉트로 기본 씬 진입(ch7-s2 draft).

## 검증
- `pnpm typecheck`·`pnpm lint`·`pnpm build` green.
- playwriter UAT(/works): 사이드바 부재(aside=0), 이어서 쓰기·AI(64%)·검토(1건) 카드, 집계(작품3·16.3만자·연재1), 작품 그리드, 집필 계속→집필 화면(에디터 렌더) 모두 통과.
