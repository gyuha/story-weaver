<!-- forge-slug: m1-hierarchy-backend -->
<!-- task: 29 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
# M1 — 계층(시놉시스·부·챕터·씬) 백엔드

`data-model.md` 2장의 계층 모델(Work → Synopsis → Episode(부) → Chapter(챕터) → Scene(씬))을 백엔드에 신설한다. 현재 백엔드에는 `Work` 최상위 테이블만 있고 그 아래 계층은 전혀 없다. 이 작업은 World Bible(엔티티 카드 등)이 참조할 `scene_id`/`global_seq`의 토대이므로 M1의 다른 백엔드 작업(엔티티 카드, 타임라인 상태, 씬-엔티티 링크)보다 먼저 온다.

## 목표 / 비목표

- 목표: `synopses`(작품당 1)·`episodes`(부)·`chapters`·`scenes`(본문 `body` 보유, `global_seq` 포함) 테이블+모델+CRUD 라우터+테스트. 격리는 기존 works 패턴(`work_id` FK + 소유권 체크)을 그대로 따른다.
- 비목표: 웹 연동(별도 작업 `m1-web-hierarchy-wiring`), 엔티티 카드·타임라인 상태·씬-엔티티 링크(별도 작업), `global_seq` 재계산 최적화(단순 재계산으로 충분 — data-model.md 2.1 "미결정, 정렬 가능한 시점값이 존재한다는 불변식만 요구").

## 진실의 출처

- Glossary terms: 부(Part, 코드/DB 식별자는 `episodes`) — `.forge/CONTEXT.md`.
- Related ADRs: `.forge/adr/0005-users-as-tenant-app-layer-scoping.md`.
- 코드 사실: `api/src/domains/works/`에 `Work` 모델만 존재(episodes/chapters/scenes 없음, 탐색 확인됨). web mock 타입(`web/src/features/shared/types.ts`)의 `Chapter`/`Scene`가 프론트 계약의 참고 모양이나, 백엔드는 data-model.md 스키마(synopsis 별도, episode=부, global_seq 등)를 따른다 — 완전히 동일하지 않음(웹 wiring 작업에서 매핑).
- Definition of Done: 작품에 시놉시스 1개, 부/챕터/씬을 CRUD할 수 있고 씬은 작품 내 전역 순서(`global_seq`)를 가진다. `task lint`/`task test`(api) 통과.

## 작업 조각

- [ ] S1. 마이그레이션 + 모델 (TDD) — completion criterion: `synopses`(work_id unique FK)·`episodes`(work_id, title, order_index)·`chapters`(work_id, episode_id, title, order_index)·`scenes`(work_id, chapter_id, order_index, global_seq, title nullable, body) alembic 마이그레이션 생성, `task migrate` 적용 확인, SQL 리뷰(api/CLAUDE.md 규칙).
- [ ] S2. 시놉시스 CRUD (TDD) — completion criterion: `GET/PUT /api/v1/works/{work_id}/synopsis`(작품당 1, PUT은 upsert) + 서비스/리포지토리 + pytest.
- [ ] S3. 부·챕터·씬 CRUD (TDD) — completion criterion: `POST/GET/PATCH/DELETE /api/v1/works/{work_id}/episodes`, `.../episodes/{id}/chapters`, `.../chapters/{id}/scenes` 라우터+서비스+리포지토리. 씬 생성 시 `global_seq`는 작품 내 현재 최대값+1로 부여(단순 재계산, 삽입/이동 시 재부여는 이 작업 범위 — 재계산 최적화는 비목표). 삭제 시 cascade(작품 삭제 시 하위 전부, 부 삭제 시 챕터/씬). pytest(fake+실DB 혼용, works 패턴 재사용).
- [ ] S4. 격리 확인 — completion criterion: 신규 4개 리소스 모두 계정 B 토큰으로 접근 시 404(m0 통합 테스트 패턴 재사용). (depends: S1-S3)
- [ ] S5. 검증 — completion criterion: `task lint`/`task test`(api) 통과, `task contract`로 openapi 재추출.
