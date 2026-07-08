<!-- forge-slug: m1-entity-card-backend -->
<!-- task: 30 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
<!-- part: 1/1 -->
# M1 — 엔티티 카드(World Bible) 백엔드

`data-model.md` 3장의 엔티티 카드(인물·장소·사건·아이템)를 백엔드에 신설한다. `m1-hierarchy-backend`(task 29)가 만드는 `scenes`를 참조하므로 그 뒤에 온다(사건 카드의 `occurred_at_scene`, 관계 참조 등).

## 목표 / 비목표

- 목표: `entities` 테이블(공통 필드 + 타입별 `attributes` JSONB) + 4종 타입(character/location/event/item) CRUD 라우터+테스트. 인물의 `relations`(3.3, 방향성 있는 관계 목록)도 `attributes` 안에 포함.
- 비목표: 타임라인 상태·씬-엔티티 링크(별도 작업), 관계 시각화(v2), 이미지 첨부 실제 생성(v2-D) — 이미지 URL 필드만 nullable로 열어두되 생성 로직은 없음, 웹 연동(별도 작업 `m1-web-entity-wiring`).

## 진실의 출처

- Glossary terms: 엔티티 카드(Entity Card) — `.forge/CONTEXT.md`.
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md`(정형 카드가 메모리의 1차 데이터).
- 코드 사실: 백엔드에 `entities` 테이블 전혀 없음(탐색 확인). 웹 mock 타입(`web/src/features/shared/types.ts`)의 `Entity`(`fields: EntityField[]` 자유형 라벨/값 목록)는 data-model.md 3.2의 타입별 정형 JSONB(`appearance`/`personality`/`speech_style`/`sample_lines`/`relations` 등)와 **다른 모양** — 웹 wiring 작업에서 매핑/변환 필요, 이 백엔드 작업은 data-model.md 스키마를 따른다.
- Definition of Done: 작품 안에서 인물·장소·사건·아이템 카드를 만들고 조회·수정·삭제할 수 있고, 인물 카드는 관계 목록을 저장한다. `task lint`/`task test`(api) 통과.

## 작업 조각

- [ ] S1. 마이그레이션 + 모델 (TDD) — completion criterion: `entities`(id, work_id FK, entity_type enum, name, aliases text[], summary, attributes JSONB, timestamps) alembic 마이그레이션 + SQL 리뷰 + `task migrate` 확인.
- [ ] S2. 타입별 attributes 검증 스키마 (TDD) — completion criterion: Pydantic으로 4종(character: appearance/personality/speech_style/sample_lines/relations, location: description/region/atmosphere, event: description/participants/occurred_at_scene, item: description/owner/properties) 타입별 attributes 검증. entity_type에 따라 다른 스키마로 검증하는 discriminated union 또는 서비스 레벨 분기. pytest로 각 타입 정상/잘못된 필드 거부 확인.
- [ ] S3. CRUD 라우터 (TDD) — completion criterion: `POST/GET/PATCH/DELETE /api/v1/works/{work_id}/entities`, `GET /entities/{id}` — 서비스/리포지토리/pytest. 격리(계정 B 접근 시 404) 포함.
- [ ] S4. 검증 — completion criterion: `task lint`/`task test`(api) 통과, `task contract`로 openapi 재추출. (depends: S1-S3)
