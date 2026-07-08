<!-- forge-slug: m1-timeline-scene-link-backend -->
<!-- task: 31 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M1 — 타임라인 상태 + 씬-엔티티 링크 백엔드

`data-model.md` 4·5장. `m1-hierarchy-backend`(scenes)와 `m1-entity-card-backend`(entities)에 의존하는 마지막 M1 백엔드 조각.

## 목표 / 비목표

- 목표: `timeline_states`(entity_id, scene_id, state_key, state_value, source, note) + `scene_entity_links`(scene_id, entity_id, source, UNIQUE(scene_id,entity_id)) 테이블+CRUD+테스트. 타임라인 상태 조회는 "특정 씬의 global_seq 이하만" 필터 지원(스포일러 방지, 4.2/2장).
- 비목표: 자동 설정 충돌 감지(v2-B, 별도 task 43), AI 자동 추출(`source=ai_suggested`/`ai_extracted`, M3 동적 업데이트 파이프라인 task 38 소관 — 이 작업은 작가 수동 입력(`source=author`) 경로만).

## 진실의 출처

- Glossary terms: 타임라인 상태(Timeline State), 씬-엔티티 링크(Scene-Entity Link) — `.forge/CONTEXT.md`.
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md`(링크 1차+벡터 보조 설계의 전제 데이터).
- 코드 사실: 둘 다 백엔드에 전혀 없음(탐색 확인). `scenes.global_seq`(task 29)가 시점 비교 기준.
- Definition of Done: 씬에 엔티티를 수동 연결/해제할 수 있고, 엔티티에 시점별 상태를 기록·조회(현재 시점 이하만)할 수 있다. `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. 마이그레이션 + 모델 (TDD) — completion criterion: `timeline_states`·`scene_entity_links` alembic 마이그레이션 + SQL 리뷰 + `task migrate`.
- [ ] S2. 씬-엔티티 링크 CRUD (TDD) — completion criterion: `POST/DELETE /api/v1/works/{work_id}/scenes/{scene_id}/links`(entity_id, source=author 고정), `GET .../links` — 중복 방지(UNIQUE 제약 위반 시 409 또는 idempotent). pytest.
- [ ] S3. 타임라인 상태 CRUD (TDD) — completion criterion: `POST /api/v1/works/{work_id}/entities/{entity_id}/timeline-states`(source=author), `GET .../timeline-states?up_to_scene_id=`(해당 씬 global_seq 이하만 반환) — 서비스에서 global_seq 필터 로직. pytest로 미래 상태가 새지 않음을 검증(핵심 시나리오).
- [ ] S4. 검증 — completion criterion: `task lint`/`task test` 통과, `task contract`. (depends: S1-S3)
