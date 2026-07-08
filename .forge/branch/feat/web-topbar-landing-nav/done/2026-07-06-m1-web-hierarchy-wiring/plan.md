<!-- forge-slug: m1-web-hierarchy-wiring -->
<!-- task: 32 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M1 — 웹: 계층(부·챕터·씬) 실 API 연동

`m1-hierarchy-backend`(task 29)가 만든 부/챕터/씬 API로 에디터·타임라인 화면을 전환한다. 현재 `works.store.ts`의 `addChapter`/`addPart`/`renameChapter`/`deleteChapter`/`deletePart` 등은 전부 로컬 mock. `ADR-0008`(Work만 우선 전환, 하위 도메인은 로컬 mock 유지)이 예고한 다음 단계.

## 목표 / 비목표

- 목표: 작품을 열면 서버의 부/챕터/씬 목록을 불러오고, 화 추가/삭제/이름변경/부 추가/삭제가 실 API를 호출해 서버에 반영된다. `manuscript.tsx`의 씬 본문 저장도 실 API(`PATCH scenes/{id}`)로 전환.
- 비목표: 씬-엔티티 링크·엔티티 카드 웹 연동(별도 task 33), AI 이어쓰기 등 집필 보조 버튼(M3, 별도 task 37) — 이 작업은 순수 구조/본문 CRUD만.

## 진실의 출처

- Glossary terms: 없음.
- Related ADRs: `.forge/branch/feat/web-topbar-landing-nav/adr/0008-works-list-first-then-subdomains.md`.
- 코드 사실: `works.store.ts`의 챕터 관련 액션(`addChapter`/`addPart`/`renameChapter`/`renamePart`/`deleteChapter`/`deletePart`/`restoreSceneVersion`)이 전부 로컬(탐색 확인). `manuscript.tsx`가 이 액션들을 호출. 백엔드 응답 모양(부=episode, 화=chapter, 씬=scene)과 웹 mock 모양(`Chapter{partLabel, index, scenes}`)이 다르므로 매핑 계층 필요.
- Definition of Done: 작품 상세 화면(`works/$workId/*` 라우트)이 서버의 부·챕터·씬으로 렌더되고, 화 추가/삭제/이름변경이 새로고침 후에도 유지된다. `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. API 파사드 + Query 훅 (TDD) — completion criterion: `task contract`로 SDK 재생성 후 `web/src/features/works/api/`(또는 신규 `editor` 파사드)에 부/챕터/씬 CRUD facade + TanStack Query options/mutations 추가(기존 `works.api.ts` 패턴 준수).
- [ ] S2. 작품 로드 시 계층 하이드레이션 (TDD) — completion criterion: 작품 상세 라우트 진입 시 서버의 부/챕터/씬을 조회해 `works.store`의 해당 work에 매핑·반영(로딩/에러 상태 포함, 대시보드 S2 패턴 재사용). (depends: S1)
- [ ] S3. 화·부 CRUD 배선 (TDD) — completion criterion: `addChapter`/`addPart`/`renameChapter`/`renamePart`/`deleteChapter`/`deletePart`가 실 API 호출 후 스토어 갱신. RTL. (depends: S2)
- [ ] S4. 씬 본문 저장 배선 (TDD) — completion criterion: `manuscript.tsx`의 본문 저장이 `PATCH scenes/{id}`로 서버에 반영(디바운스 또는 명시적 저장 — 기존 저장 트리거 시점 유지). RTL. (depends: S2)
- [ ] S5. 검증 — completion criterion: `task web:check`/`pnpm test` 통과, playwriter로 부/챕터 추가→새로고침 유지 UAT. (depends: S1-S4)
