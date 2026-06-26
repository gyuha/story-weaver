<!-- forge-slug: settings-reference-add-detail -->
<!-- task: 12 -->
<!-- tdd: off -->
# 설정 참고 탭 — 참고(엔티티) 추가 팝업 + 설정 상세 팝업

## Goal / Non-goals
- Goal: 집필 화면 "설정 참고" 탭(`SettingsTab`)에 (1) **추가** 버튼 → 검색 가능한 추가 팝업에서 엔티티(설정)를 **체크박스로 여러 개 골라 "추가" 버튼으로 일괄** 현재 씬의 씬-엔티티 링크(`linkedEntityIds`)에 추가, (2) 설정 참고의 메모리 카드를 **클릭하면 그 엔티티의 상세 팝업**(기존 `EntityDetail` 재사용). 추가된 링크는 탭의 "등장 인물·설정" 그룹에 표시되고 메모리(AI 생성 재료)의 1차 근거가 된다.
- Non-goals: 추가 팝업에서 링크 해제/제거(추가 전용), World Bible에 새 엔티티 카드 생성, 벡터 보조 그룹 수동 편집, 실제 AI 생성이 링크를 소비하도록 배선(mock 단계 — 데이터 위치만 정확히), 영속화.

## Source of truth
- Glossary terms: [[엔티티 카드]], [[씬-엔티티 링크]], [[메모리]] in `.forge/CONTEXT.md` ("참고 추가" = 씬-엔티티 링크 추가 = 메모리 1차 근거 — 신규 용어 없음)
- Related ADRs: none
- Definition of Done: 설정 참고 탭에 "추가" 버튼 → 자체 오버레이 팝업(검색 입력 + 아직 링크 안 된 엔티티 목록, 이미 링크된 건 미표시, 각 항목 체크박스) → 여러 개 체크 후 "추가" → 그 엔티티들이 탭의 씬-엔티티 링크 목록에 반영, 팝업 닫힘. 메모리 카드 클릭 → `EntityDetail`을 띄운 상세 오버레이. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 추가(검색·체크·일괄 추가 반영)·상세 팝업 육안 확인.

## Work slices
- [ ] S1. 링크 추가 스토어 액션 (`works.store.ts`) — `addSceneEntityLinks(workId, sceneId, entityIds)`: 현재 씬 `linkedEntityIds`에 중복 없이 추가(immer, 기존 `findScene` 패턴) — 완료 기준: 액션 추가 + `pnpm typecheck` 통과.
- [ ] S2. 참고 추가 팝업 (`memory-panel.tsx` SettingsTab) — "등장 인물·설정" 그룹 근처에 "추가" 버튼 → 자체 오버레이 모달(버전 기록 모달과 같은 fixed inset + 백드롭 버튼 패턴). 모달 내용: 검색 input(이름·별칭·요약 부분일치), `work.entities` 중 **현재 씬에 아직 링크 안 된 것**만 목록, 각 항목 체크박스(이모지·이름·타입), 하단 "추가(n)" 버튼 → 체크된 id들로 `addSceneEntityLinks` 호출 후 닫기 — 완료 기준: playwriter로 추가 버튼→검색→체크 다수→"추가"→탭 링크 목록 반영·이미 링크된 항목 미표시 확인. (depends: S1)
- [ ] S3. 설정 상세 팝업 (`memory-panel.tsx`) — `MemoryCard`를 클릭 가능하게 하고, 클릭 시 그 엔티티의 `EntityDetail`(world-bible 재사용)을 자체 오버레이 모달에 렌더 — 완료 기준: playwriter로 메모리 카드 클릭 → 엔티티 상세(요약·필드·관계·타임라인 상태) 오버레이 표시, `pnpm lint` 통과. (depends: none)

## 비고 (eco)
- 새 의존성 0. 오버레이는 버전 기록 모달의 자체 오버레이 패턴 재사용(공통 컴포넌트로 추출은 과하면 생략, 최소 diff). 검색은 단순 `includes` 필터. 상세는 `EntityDetail` 그대로 모달 안에 렌더(스크롤 컨테이너로 감쌈).
