<!-- forge-slug: v2b-conflict-detection -->
<!-- task: 43 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# v2-B — 설정 충돌 자동 감지

`roadmap.md` 4.2, `data-model.md` 8장. M1의 `timeline_states`(task 31) 데이터 축적을 전제로 한다.

## 목표 / 비목표

- 목표: 같은 `state_key`에 모순되는 `state_value`가 시점 역행으로 나타나는 패턴을 SQL 규칙으로 1차 탐지("3화 사망 → 10화 등장" 같은 시나리오). 웹 검토 화면(`timeline-screen.tsx`의 기존 `Conflict`/`dismissConflict` mock을 실 데이터로 교체)에 표시.
- 비목표: LLM 보조 판정(ai-pipeline.md 4.1 "선택적 저비용 LLM" — 1차 SQL 규칙만으로 이 작업의 DoD 충족, LLM 보조는 후속).

## 진실의 출처

- Glossary terms: 없음.
- 코드 사실: 웹 `Conflict` 타입·`dismissConflict` mock 이미 존재(탐색 확인, `types.ts`) — UI 자산 재사용.
- Definition of Done: `life_status` 같은 예약 키에 대해 시점 역행 모순이 있으면 검토 화면에 뜬다. `task lint`/`task test`, `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. 예약 state_key 사전 (TDD, api) — completion criterion: `life_status`(alive/dead) 등 충돌 규칙이 필요한 키의 허용값 정의(data-model.md 4.1의 미결정 항목을 이 규모만큼 해소).
- [ ] S2. 충돌 탐지 SQL/쿼리 (TDD, api) — completion criterion: `GET .../works/{work_id}/conflicts` — 동일 entity_id+state_key에 대해 global_seq 순으로 모순되는 값(예: dead 이후 다시 alive 취급되는 등장)을 찾는 쿼리. pytest.
- [ ] S3. 웹 배선 (TDD) — completion criterion: `timeline-screen.tsx`가 실 API 결과로 `Conflict` 표시, `dismissConflict`가 실 API(무시 처리) 호출. RTL.
- [ ] S4. 검증 — completion criterion: api/web 게이트 통과. (depends: S1-S3)
