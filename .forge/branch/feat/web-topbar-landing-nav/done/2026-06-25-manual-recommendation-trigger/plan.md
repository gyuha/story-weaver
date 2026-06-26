<!-- forge-slug: manual-recommendation-trigger -->
<!-- task: 14 -->
<!-- tdd: off -->
<!-- retro-hint: optional -->
# 설정 참고 — "AI 추천 받기" 수동 트리거

## Goal / Non-goals
- Goal: "설정 참고" 탭에 **"✨ AI 추천 받기"** 버튼을 더해, 누르면 (mock) 추천 항목 몇 개를 통합 목록에 "추천 N%" 배지로 채워준다. 자동 추천이 고정 시드뿐인 현 상태에서, 사용자가 원할 때 추천을 불러오는 수동 액션을 제공한다. 추가된 추천은 기존 항목과 동일하게 X로 제거 가능, **ephemeral**(세션 한정).
- Non-goals: 실제 임베딩/벡터 검색(글 내용 기반 진짜 추천 — 백엔드 필요), 추천 결과 영속화, 점수의 실제 의미(mock 값), 데이터 모델·스토어 변경, "추천을 수동 링크로 승격"하는 별도 동작(기존 추가 팝업이 담당).

## Source of truth
- Glossary terms: [[메모리]], [[씬-엔티티 링크]], [[엔티티 카드]] in `.forge/CONTEXT.md` (추천 = 메모리의 자동/보조 표시 — 본 트리거는 그 mock 시연)
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md` (자동 회상의 자리표시 — 데이터 구조 불변)
- Definition of Done: "설정 참고" 탭에 "AI 추천 받기" 버튼이 있고, 클릭 시 **아직 목록에 없는 엔티티**(수동 링크·기존 자동 추천·세션 제외분·이미 추천한 것 제외) 중 최대 3개가 "추천 N%" 배지로 통합 목록에 추가된다. 점수는 결정적 mock(랜덤 아님). 추가된 추천은 X로 제거되고, 후보가 없으면 "추천할 설정이 없습니다" 토스트. ephemeral(새로고침 초기화). `pnpm typecheck` + `pnpm lint` 통과, playwriter로 버튼→추천 추가→배지·제거·후보없음 토스트 육안 확인.

## Work slices
- [ ] S1. "AI 추천 받기" 트리거 (`memory-panel.tsx` SettingsTab) — "설정 참고 추가" 옆/아래에 "✨ AI 추천 받기" 버튼 추가. 로컬 state `manualRecs: { entityId: string; score: number }[]`. 클릭 시 후보 = `work.entities` 중 (수동 링크 ∪ `scene.vectorMemory` ∪ `dismissed` ∪ 기존 manualRecs) 제외분, 상위 최대 3개에 결정적 mock 점수(후보 순서 기반, 예: 88·82·75) 부여해 `manualRecs`에 추가. 통합 목록 계산 시 자동 후보에 `manualRecs`도 합쳐(autoScore로) "추천 N%" 표시. 제거 X는 기존 dismissed 경로로 동작(자동 출처라 dismiss). 후보 0개면 토스트 — 완료 기준: playwriter로 버튼 클릭→미참조 엔티티가 추천 배지로 추가·X 제거·후보 소진 시 토스트 확인, `pnpm typecheck`·`lint` 통과.

## 비고 (eco)
- 데이터·스토어·타입 변경 0(로컬 state만). 점수는 결정적 mock(// eco: 실 임베딩 검색으로 교체). 기존 통합 목록(task #13)의 자동 후보 계산에 manualRecs를 더하는 식으로 최소 diff.
