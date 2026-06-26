# run.md — 새 엔티티 추가 페이지 (part 1/2)

실행일: 2026-06-26 · 슬러그: new-entity-page-1of2 · task #15 · part 1/2
규모 있으나 직접 실행. eco on.

## 계획대로 된 것
- **S1** `addEntity(workId, NewEntityInput): string` 스토어 액션(공통 + fields/sampleLines/relations, push, id 반환). `new-entity-screen.tsx`. `entity-list`의 "새 엔티티"를 `Link`로 `/works/$workId/bible/new` 연결.
- **S2** `NewEntityScreen`: 유형 선택(인물/장소/사건/아이템) → 유형별 폼 스위치(공통 이모지·이름·별칭·요약 + 유형별 텍스트/textarea, data-model 3.2). 이름 필수, 저장 시 Entity 매핑 후 상세로 navigate.
- **S3** 인물 반복 에디터 `RepeatEditor`(샘플 대사 / 관계 이름·역할 행 추가·삭제), 저장 시 sampleLines/relations 매핑.
- typecheck·lint 통과. playwriter로 페이지 렌더·유형 전환(인물↔장소 폼 변화)·인물 반복 입력·저장→"한설" 목록 추가+상세 이동 전 흐름 육안 확인.

## 계획과 달랐던 것 (분기 — 중간)
- **라우트 재구성**: 플랫 `bible.tsx`에 `/bible/new`를 더하면 bible가 레이아웃이 되는데 Outlet이 없어 새 페이지 대신 목록이 렌더됨(playwriter로 확인). `bible.tsx`를 `component: Outlet` 레이아웃으로 바꾸고 기존 목록을 `bible.index.tsx`로 분리해 해결(write/ 패턴과 동일). `bible_.new` underscore 시도는 이 플러그인에서 리터럴 세그먼트(`bible_/new`)가 돼 폐기.
- addEntity 입력에 imageUrl은 미포함(part 2/2에서 확장 예정).

## Non-goals 준수
- 이미지 생성(part 2/2)·엔티티 id 연결·편집/삭제·실 API 손대지 않음.

## eco 천장
- 폼 상태 로컬 useState, 유형별 필드는 data-model 3.2 그대로 분기(과한 추상화 없음).

## 코드 리뷰
- mock UI(페이지·폼·스토어 add), auth/마이그레이션 무관 저위험 → 별도 리뷰 생략. (라우트 재구성은 playwriter로 직접 확인함.)
