# run.md — 설정 참고 추가 팝업 + 설정 상세 팝업

실행일: 2026-06-25 · 슬러그: settings-reference-add-detail · task #12
규모 작아 직접 실행. eco on.

## 계획대로 된 것
- **S1** `works.store.ts` `addSceneEntityLinks(workId, sceneId, entityIds)` — 중복 제외 push (immer).
- **S2** `memory-panel.tsx` SettingsTab: "설정 참고 추가" 버튼 → `AddReferenceModal`(자체 오버레이): 검색 input(이름·별칭·요약 부분일치), 미링크 엔티티만 목록, 체크박스 다중선택, "추가(n)" 일괄 → `addSceneEntityLinks` → 닫기.
- **S3** `MemoryCard`를 버튼화 + onClick → `DetailModal`(자체 오버레이)에 기존 `EntityDetail` 재사용 렌더.
- typecheck·lint 통과. playwriter로 추가 버튼→검색→다중 체크→"추가(2)"→패널 반영(혈산문·약왕곡, 기존 링크 천류운·백서린은 목록 제외)·카드 클릭→EntityDetail 상세 전 흐름 육안 확인.

## 계획과 달랐던 것 (분기 — 낮음)
- linked 그룹을 항상 표시(빈 가드 제거)하고 그 아래 "추가" 버튼 배치 → 링크 0개여도 추가 진입 가능. 기존 하단 "아직 없음" 빈 상태 블록 제거(추가 버튼이 대체).

## Non-goals 준수
- 추가 팝업에서 해제·World Bible 신규 엔티티 생성·벡터 수동 편집·실 AI 소비 배선·영속화 모두 손대지 않음.

## eco 천장
- 새 의존성 0. 오버레이는 버전 기록 모달의 자체 오버레이 패턴 재사용(공통 추출은 생략, 최소 diff). 검색 단순 includes.

## 코드 리뷰
- mock UI(데이터 변경 아님), 저위험 → 별도 리뷰 생략.
