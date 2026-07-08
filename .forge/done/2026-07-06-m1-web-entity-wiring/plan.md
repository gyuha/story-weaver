<!-- forge-slug: m1-web-entity-wiring -->
<!-- task: 33 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M1 — 웹: 엔티티 카드(World Bible) + 씬-엔티티 링크 실 API 연동

`m1-entity-card-backend`(task 30)·`m1-timeline-scene-link-backend`(task 31)로 world-bible 화면을 전환한다.

## 목표 / 비목표

- 목표: 엔티티 카드 목록·생성·수정이 실 API로 동작. 씬에서 엔티티 링크 추가/제거가 실 API로 동작. 웹의 자유형 `fields: EntityField[]` 입력 UI는 유지하되, 백엔드 전송 시 타입별 정형 `attributes`로 매핑(예: label "외모"→`appearance`).
- 비목표: 타임라인 상태 웹 연동(검토 화면, `timeline-screen.tsx`)은 이 작업에 포함 — 아래 슬라이스에 포함시킴(별도 분리하지 않음, 화면이 이미 같은 도메인). AI 자동 추출 제안(M3 동적 업데이트, task 38).

## 진실의 출처

- Glossary terms: 엔티티 카드 — `.forge/CONTEXT.md`.
- Related ADRs: `.forge/branch/feat/web-topbar-landing-nav/adr/0008-works-list-first-then-subdomains.md`.
- 코드 사실: `entity-form.tsx`/`new-entity-screen.tsx`/`edit-entity-screen.tsx`가 `useWorksStore`의 `addEntity`/`updateEntity`(로컬)만 호출(탐색 확인). `EntityField{label,value}` 자유형 vs 백엔드 `attributes`(타입별 고정 키) 매핑 필요 — 라벨→키 매핑 테이블은 이 작업에서 확정(예: 인물 "외모"→`appearance`, "성격"→`personality`, "말투"→`speech_style`).
- Definition of Done: World Bible에서 엔티티 카드를 만들고 수정하면 서버에 저장되고 새로고침 후에도 유지된다. 씬에서 엔티티를 연결/해제하면 서버에 반영된다. 타임라인 검토 화면이 서버의 상태 목록을 보여준다. `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. API 파사드 + Query 훅 (TDD) — completion criterion: `task contract` 재생성 후 엔티티/링크/타임라인상태 facade+Query 훅 추가.
- [ ] S2. 엔티티 카드 CRUD 배선 (TDD) — completion criterion: 목록/생성/수정 화면이 실 API 호출, `EntityField[]`↔`attributes` 라벨 매핑 적용. RTL. (depends: S1)
- [ ] S3. 씬-엔티티 링크 배선 (TDD) — completion criterion: `addSceneEntityLinks`/`removeSceneEntityLink`가 실 API 호출. RTL. (depends: S1)
- [ ] S4. 타임라인 검토 화면 배선 (TDD) — completion criterion: `timeline-screen.tsx`가 서버의 타임라인 상태 목록을 조회·표시(현재는 mock `work.timeline`). RTL. (depends: S1)
- [ ] S5. 검증 — completion criterion: `task web:check`/`pnpm test` 통과, playwriter로 엔티티 생성→새로고침 유지, 씬 링크 UAT. (depends: S1-S4)
