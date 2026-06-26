# run.md — 부·화 삭제 + 삭제 후 재번호

실행일: 2026-06-25 · 슬러그: delete-part-chapter · task #11
규모 작아 직접 실행. eco on.

## 계획대로 된 것
- **S1** `works.store.ts`: `deleteChapter`(제거 후 같은 partLabel 화 1..n 재번호), `deletePart`(partLabel cascade 제거 후 "제N부…" 라벨 숫자 당김 — 이름 유지, 미일치 라벨 카운터 미소비). immer 패턴.
- **S2** `work-tree.tsx`: 부·화 행에 `RowMenu`(⋯ → 드롭다운, 항목 "삭제", 바깥 클릭 닫기). 삭제 시 `useModal` 경고 다이얼로그("…삭제됩니다. 복구할 수 없습니다.") → 확인 시 store 호출.
- typecheck·lint 통과. playwriter로 6화 삭제→7화가 1화로 재번호, 제1부 삭제→cascade+제2부가 제1부로 당김, 복구 불가 경고 전부 육안 확인.

## 계획과 달랐던 것 (분기 — 중간)
- **deletePart 재번호 버그 즉석 수정**: 처음엔 루프 중 partLabel을 바로 rewrite해 재번호된 라벨이 다시 처리되는 버그. 라벨을 먼저 순서대로 수집 → remap Map 구성 → 일괄 적용으로 고침.
- **행 구조 재배치**: 화 행 Link는 버튼 중첩 불가라, 부/화 행을 `group flex` 래퍼로 감싸 (toggle/Link flex-1) + RowMenu 형제 배치. hover 배경을 래퍼로 이동.
- ⋯ 버튼은 group-hover + 메뉴 열림 시 노출(opacity).

## Non-goals 준수
- 드래그 수동 순서변경·undo/복구·실 API·부 수동 이동·커스텀 라벨 숫자 재번호 모두 손대지 않음.

## eco 천장
- 새 의존성 0(useModal·lucide 재사용). 드롭다운은 로컬 state + 백드롭 버튼 최소 구현.

## 코드 리뷰
- mock store + 트리 컴포넌트, auth/API/마이그레이션 무관 저위험 → 별도 리뷰 생략. (단 재번호 로직은 비자명 — playwriter로 두 케이스 검증함.)
