# run.md — 설정 참고 "AI 추천 받기" 수동 트리거

실행일: 2026-06-25 · 슬러그: manual-recommendation-trigger · task #14
규모 작아 직접 실행. eco on. 스토어·타입 변경 0(로컬 state만).

## 계획대로 된 것
- **S1** `memory-panel.tsx` SettingsTab에 "✨ AI 추천 받기" 버튼 + 로컬 state `manualRecs`. 클릭 시 후보 = `work.entities` 중 (수동 링크 ∪ 벡터 시드 ∪ manualRecs ∪ dismissed) 제외분 상위 3개에 결정적 mock 점수[88·82·75] 부여 → manualRecs 추가. 통합 목록의 자동 후보(autoPool = vectorMemory + manualRecs)로 합쳐 "추천 N%" 배지 표시. 제거 X는 기존 dismissed 경로로 동작. 후보 0개면 "추천할 설정이 없습니다" 토스트.
- typecheck·lint 통과. playwriter로 버튼 클릭→미참조 엔티티가 추천 배지로 추가, 재클릭 시 다른 후보 추가(제외), 추천 항목 X 제거(토스트·사라짐) 육안 확인.

## 계획과 달랐던 것
- 거의 없음(분기 낮음). 계획대로 단일 슬라이스.

## Non-goals 준수
- 실 임베딩·영속화·데이터 모델/스토어 변경·추천→링크 승격 모두 손대지 않음.

## eco 천장
- 점수·후보 결정적 mock(// eco: 실 벡터 검색으로 교체). manualRecs는 ephemeral 로컬 state.

## 코드 리뷰
- mock UI 로컬 state 변경, 저위험 → 생략.
