<!-- forge-slug: m3-dynamic-update-pipeline -->
<!-- task: 38 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M3 — 동적 업데이트 파이프라인(신규 설정 감지 → 승인 → 반영)

`ai-pipeline.md` 7장. M1(entities/timeline_states)·M2(임베딩)·M3 백엔드(task 34,36)에 의존하는 M3의 마지막 조각.

## 목표 / 비목표

- 목표: 씬 저장 시 저비용 모델로 "신규 엔티티/속성 변경/타임라인 상태 변화" 후보를 JSON으로 추출 → 기존 엔티티 매칭(name/aliases 정확 일치로 충분 — 미결정 항목 중 가장 단순한 방식 채택) → 작가 검토용 제안 생성(`source=ai_suggested`/`ai_extracted`) → 승인 시 반영(entities/timeline_states 갱신, 거절 시 폐기) → 반영된 소스 재임베딩. 웹: 기존 `updateSuggestion` UI(승인/거절 버튼 이미 있음)를 실 제안 데이터로 연동.
- 비목표: 비동기 큐 인프라(Redis/Celery 등) — 동기 처리로 충분(트리거 시점 즉시 처리, 미결정 항목이나 이 작업 규모에서는 단순함 우선). 자동 충돌 감지(v2-B, task 43).

## 진실의 출처

- Glossary terms: 타임라인 상태(source=ai_suggested), 씬-엔티티 링크(source=ai_extracted) — `.forge/CONTEXT.md`.
- 코드 사실: 웹 `Scene.updateSuggestion`(타입 정의 존재)과 `acceptSuggestion`/`dismissSuggestion` 액션이 이미 mock으로 존재(`works.store.ts`, 탐색 확인) — 이 작업에서 실 데이터로 교체.
- Definition of Done: 씬을 저장하면 신규 설정이 감지될 경우 제안이 뜨고, 승인하면 엔티티 카드/타임라인 상태에 실제로 반영되며 거절하면 아무 변화가 없다. `task lint`/`task test`(api) + `task web:check`/`pnpm test`(web) 통과.

## 작업 조각

- [ ] S1. 추출 API (TDD, api) — completion criterion: 씬 저장 후 호출되는 `POST /api/v1/works/{work_id}/scenes/{scene_id}/extract-updates` — 저비용 모델(4.1)로 씬 본문+링크된 엔티티 카드를 입력, 구조화 JSON(신규 엔티티 후보/속성 변경/상태 변화) 추출. pytest(fake+실 LLM 1건).
- [ ] S2. 매칭·제안 (TDD, api) — completion criterion: 추출 결과를 기존 엔티티와 name/aliases 정확 매칭, 동일하면 무시(노이즈 억제), 다르면 제안 레코드로 저장(`GET .../update-suggestions`). pytest.
- [ ] S3. 승인/거절 반영 (TDD, api) — completion criterion: `POST .../update-suggestions/{id}/approve|reject` — 승인 시 entities.attributes 갱신 또는 timeline_states 1행 추가(source=ai_suggested) + 재임베딩 트리거, 거절 시 폐기. pytest.
- [ ] S4. 웹 배선 (TDD) — completion criterion: `acceptSuggestion`/`dismissSuggestion`이 실 API 호출로 교체, 씬 저장 후 제안 조회. RTL.
- [ ] S5. 검증 — completion criterion: api `task lint`/`task test`, web `task web:check`/`pnpm test` 통과, playwriter로 씬 저장→제안 발생→승인→카드 반영 UAT. (depends: S1-S4)
