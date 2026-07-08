<!-- forge-slug: unify-settings-reference-list -->
<!-- task: 13 -->
<!-- tdd: off -->
# 설정 참고 통합 — 수동 링크 + 자동(벡터) 추천을 출처 배지 단일 목록으로

## Goal / Non-goals
- Goal: "설정 참고" 탭의 두 그룹(등장 인물·설정[수동 링크] + 관련 설정[벡터 보조])을 **하나의 목록**으로 통합하되, 각 항목에 **출처 배지**(✍️ 수동 / ✨ 자동추천 +유사도%)를 달아 구분을 유지한다. 한 엔티티가 수동·자동 양쪽이면 카드는 1개로 두되 **해당 배지를 모두(OR) 표시**한다(예: 링크 + 추천 88%). 씬 진입 시 벡터 추천이 자동 항목으로 목록에 합쳐 보이고, 사용자는 추가 팝업으로 수동 항목을 넣고 각 항목을 제거할 수 있다. 내부 데이터(`linkedEntityIds` 1차 / `vectorMemory` 보조)는 분리 보존(ADR-0002 유지) — 통합은 표시 계층만.
- Non-goals: 저장 시 벡터 db 재조회(실 임베딩 파이프라인 필요 — 지금은 진입 시 기존 시드로 시연), 자동 항목 제외(dismiss)의 영속화(mock ephemeral이라 세션 한정), `linkedEntityIds`/`vectorMemory`를 한 배열로 합치는 데이터 병합, 실제 AI 생성이 목록을 소비하도록 배선.

## Source of truth
- Glossary terms: [[메모리]], [[씬-엔티티 링크]], [[엔티티 카드]] in `.forge/CONTEXT.md` (메모리 = 링크 1차 + 벡터 보조의 하이브리드 — 이 통합은 그 표시일 뿐)
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md` (데이터는 링크/벡터 분리 유지 — 본 작업이 그 구조를 바꾸지 않음)
- Definition of Done: 집필 화면 "설정 참고" 탭이 **단일 목록**으로 렌더되고, 각 카드에 출처 배지가 보인다 — 같은 엔티티가 수동·자동 양쪽이면 카드 1개에 **두 배지 모두(OR)** 표시. 진입 시 벡터 추천이 자동 항목으로 합쳐 표시되고, 추가 팝업으로 수동 추가, 각 항목 hover X로 제거된다 — 제거는 **완전 제거**(수동분이면 `removeSceneEntityLink` + 자동분이면 세션 dismiss를 함께 수행해 목록에서 사라짐). 별도 "관련 설정" 그룹·라벨은 없다. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 통합 목록·배지(단일/이중)·추가·제거 육안 확인.

## Work slices
- [ ] S1. 통합 목록 + 출처 배지 (`memory-panel.tsx` SettingsTab) — `linked`(수동)와 `vector`(자동)를 엔티티 id로 합쳐 **카드 1개/엔티티**의 통합 항목 구성(`{ entity, manual: bool, autoScore?: number }`, 수동 먼저·자동만은 유사도 내림차순). 각 카드에 **해당 배지를 모두** 렌더: manual이면 "링크"(link 톤), autoScore 있으면 "추천 N%"(vector 톤) — 둘 다면 두 배지 함께. 기존 "관련 설정" 그룹/`MemoryGroupLabel` 정리, 상단 단일 라벨("설정 참고"). 빈 상태 문구 갱신 — 완료 기준: 한 목록에 단일·이중 배지가 정확히 표시, `pnpm typecheck` 통과.
- [ ] S2. 통합 add/remove (`memory-panel.tsx`) — 추가 팝업(기존 `AddReferenceModal`)은 수동 링크 추가 그대로 유지. 제거 X는 **완전 제거**: 항목이 manual이면 `removeSceneEntityLink` 호출하고, autoScore가 있으면 로컬 `dismissed` Set에도 추가 — 둘 다인 항목은 둘 다 수행해 목록에서 사라짐. 자동 후보 계산 시 `dismissed` 제외 — 완료 기준: playwriter로 수동·자동·이중 항목이 X로 모두 사라지고 추가 팝업 수동 추가가 통합 목록에 반영됨 확인, `pnpm lint` 통과. (depends: S1)

## 비고 (eco)
- 데이터 모델·스토어 변경 0(기존 `addSceneEntityLinks`·`removeSceneEntityLink` 재사용, 자동 dismiss는 로컬 state). 표시 계층만 손댐. 실 구현 노트: 저장 시 벡터 재조회 + dismiss 영속화는 백엔드 임베딩 붙을 때(// 주석으로 남김).
