# run.md — 설정 참고 통합(수동+자동 출처 배지 단일 목록)

실행일: 2026-06-25 · 슬러그: unify-settings-reference-list · task #13
규모 작아 직접 실행. eco on. 데이터 모델·스토어 변경 0(표시 계층만).

## 계획대로 된 것
- **S1** SettingsTab을 단일 목록으로 통합: `linkedEntityIds`(수동)·`vectorMemory`(자동)를 엔티티 id로 합쳐 카드 1개/엔티티(`{entity, manual, autoScore?}`, 수동 먼저·자동만 유사도 내림차순). 각 카드에 해당 배지 모두 — 수동="링크", 자동="추천 N%", 둘 다면 둘 다. "관련 설정" 그룹·라벨 제거, 단일 라벨("설정 참고 · 수동 + 자동 추천"). `MemoryCard`를 단일 `badge`→`badges[]`로 변경.
- **S2** 추가 팝업(수동) 유지. 제거 X = 완전 제거: 수동분 `removeSceneEntityLink` + 자동분 로컬 `dismissed` Set, 둘 다면 둘 다 → 목록에서 사라짐. 자동 후보는 `dismissed` 제외.
- typecheck·lint 통과. playwriter로 단일 목록·단일 배지(혈산문 추천 92%)·이중 배지(혈산문 수동 추가 → 링크+추천 92%)·완전 제거(이중 항목 X → 사라짐, 자동 복귀 안 함) 전 흐름 육안 확인.

## 계획과 달랐던 것 (분기 — 낮음)
- 거의 없음. 계획대로. `MemoryCard` 시그니처를 badges 배열로 바꾼 게 유일한 구조 변경(호출부 함께 갱신).

## Non-goals 준수
- 저장 시 벡터 재조회·dismiss 영속화·데이터 병합·실 AI 소비 배선 모두 손대지 않음(데이터는 ADR-0002대로 링크/벡터 분리 유지).

## eco 천장
- 스토어·타입 변경 0. 자동 dismiss는 ephemeral 로컬 state(실 구현 시 영속화 필요 — 주석).

## 코드 리뷰
- mock 표시 계층 변경, 저위험 → 별도 리뷰 생략.
