<!-- forge-slug: works-dashboard-real-api -->
<!-- task: 27 -->
<!-- priority: high -->
<!-- tdd: on -->
# Works 대시보드(목록·생성)를 실 Work API로 전환

`/works` 대시보드의 작품 목록·생성을 백엔드 `works` API(이미 존재, `GET/POST /api/v1/works`)로 전환한다. 현재 `works.store.ts`는 전부 `seedWorks` mock이고, 웹의 `worksApi`/`worksQueries`/`worksMutations` 파사드(`web/src/features/works/api/works.api.ts`)는 이미 만들어져 있으나 어떤 컴포넌트도 쓰지 않는다. 데모 시드(챕터·씬·엔티티·타임라인이 채워진 mock 예시 작품)는 이번에 제거하고 실 작품부터 새로 시작한다(`.forge/branch/feat/web-topbar-landing-nav/adr/0008-works-list-first-then-subdomains.md`).

## 목표 / 비목표

- 목표: 대시보드가 로그인한 사용자의 실 Work 목록을 서버에서 조회해 표시하고(로딩 스피너/스켈레톤, 에러 배너), "새 작품 만들기"로 생성한 작품이 서버에 저장되어 목록에 반영된다. 상단바/사이드바의 workspaceName·authorInitial은 `useAuthStore`의 실 사용자 정보(`display_name`)로 표시한다.
- 비목표:
  - Work 수정(제목·장르 등 변경)·삭제 UI — 백엔드 엔드포인트는 있으나(`PATCH`/`DELETE /works/{id}`) 현재 UI에 해당 화면/버튼이 없어 범위 밖.
  - 챕터·씬·엔티티·타임라인·씬-엔티티 링크 백엔드 — 다음 M1 후속 작업(별도 그릴링). 이번 작업 이후에도 새 작품은 이 하위 도메인들을 로컬 mock 상태(빈 배열로 시작, 세션 내 편집, 새로고침 시 유지 안 됨)로 유지한다.
  - AI 사용량(`usage`) 실 연동 — 계속 mock.
  - 상단바 `user-menu.tsx`의 테마 선택 서버 저장 연동 — 별개 후속 작업(회고 `.forge/retro/2026-07-04-user-profile-theme-persistence.md`에서 나온 후보).

## 진실의 출처

- Glossary terms: 없음 (구현 전략 결정, 도메인 용어 아님).
- Related ADRs:
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0008-works-list-first-then-subdomains.md` — Work만 우선 전환, 하위 도메인은 로컬 mock 유지.
  - `.forge/adr/0005-users-as-tenant-app-layer-scoping.md` — 테넌시 루트(`users`)와 소유권 스코핑 근거.
- 코드 사실(확인됨):
  - 백엔드 `api/src/domains/works/`에 Work CRUD 전부 존재(`GET/POST /works`, `GET/PATCH/DELETE /works/{id}`), 응답은 프론트 `Work`의 최상위 필드 + `stats`/`reviewSummary`(현재 0/기본값, 하위 도메인 부재)만 포함하고 `chapters`/`entities`/`timeline`/`conflicts`는 응답에서 제외.
  - 웹 `works.api.ts`에 `worksApi`(list/create/detail/update/remove)·`worksQueries`(list/detail)·`worksMutations`(create/update/remove)가 이미 완성돼 있으나 사용처 0건.
  - `works.store.ts`: `works: Work[]`가 챕터·엔티티·타임라인·충돌까지 전부 중첩한 단일 mock 배열(`seedWorks`로 초기화), `addWork`가 로컬에서 빈 nested 배열로 새 Work를 합성. `workspaceName`/`authorInitial`도 이 스토어의 mock 문자열.
  - `dashboard-screen.tsx`/`work-card.tsx`/`new-work-modal.tsx`에는 Work 수정·삭제 UI가 없음(목록 표시 + 생성만).
  - 기존 web 테스트(auth/settings 도메인) 중 `seedWorks`/`useWorksStore`를 참조하는 파일 0건 — 시드 제거로 인한 기존 테스트 회귀 위험 없음.
  - `SessionRestore`(`__root.tsx`)가 마운트 시 `authApi.me()` → `setUser`로 Zustand 스토어를 하이드레이션하는 선례 패턴이 이미 있음(이번 작업의 로딩/에러 처리는 이 패턴 대신 `useQuery`를 대시보드에서 직접 써서 로딩/에러 상태를 얻는 방식을 따른다 — 상세는 작업 조각 참고).
- Definition of Done: 로그인 후 `/works`를 열면 서버의 실 Work 목록이 뜨고(0건이면 빈 상태), 새 작품을 만들면 서버에 저장되고 목록에 나타난다. 워크스페이스 이름/이니셜이 실 사용자 정보로 표시된다. 기존 에디터/World Bible/타임라인 화면은 회귀 없이 그대로 동작(빈 nested 배열로 시작하는 것은 기존 mock `addWork`와 동일 동작). `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. 스토어 계약 변경 (TDD) — completion criterion: `works.store.ts`의 `works` 초기값을 `[]`로, 서버 목록을 반영하면서 기존에 로컬로 채워진 nested 배열(챕터·엔티티 등)을 보존하는 `setWorks(serverWorks)` 액션 추가. `addWork`를 로컬 합성 대신 서버 생성 결과(WorkResponse) + 빈 nested 배열을 받아 그대로 반영하는 계약으로 변경(예: `addWorkFromServer`). `workspaceName`/`authorInitial`은 스토어에서 제거하고 `useWorkspaceMeta()`(`selectors.ts`)가 `useAuthStore`의 `display_name`에서 파생하도록 변경. 유닛 테스트: `setWorks`가 로컬 nested 데이터를 보존/신규 작품은 빈 배열로 초기화함을 검증.
- [ ] S2. DashboardScreen 실 API 연동 (TDD) — completion criterion: `worksQueries.list()`로 목록을 조회해 로딩(스피너/스켈레톤)·에러(배너) 상태를 렌더하고, 성공 시 `setWorks`로 스토어에 반영한 뒤 기존 UI(카드 그리드·요약 통계)가 그대로 렌더된다. 빈 목록(작품 0건)일 때 "이어서 쓰기" 카드 없이 정상 렌더(기존 `{resume && ...}` 가드로 이미 방어됨, 회귀 없음 확인). RTL: 로딩/에러/빈 목록/정상 목록 4가지 상태 렌더 검증. (depends: S1)
- [ ] S3. NewWorkModal 실 API 연동 (TDD) — completion criterion: 제출 시 `worksMutations.create()` 호출, 성공 시 반환된 WorkResponse + 빈 nested 배열을 스토어에 반영 후 새 작품 집필 화면으로 이동. 제출 중 버튼 비활성화(중복 제출 방지), 실패 시 에러 안내. RTL: 제출→성공 반영, 제출 중 비활성화 검증. (depends: S1)
- [ ] S4. 데모 시드 정리 — completion criterion: `mock/works.ts`의 `seedWorks`(챕터·엔티티·타임라인 채워진 데모 작품)를 제거하고 `seedUsage`(AI 사용량, 계속 mock 유지)는 남긴다. S1~S3 변경으로 생긴 미사용 import/orphan 제거. `task web:typecheck`/`lint` 통과.
- [ ] S5. 검증 — completion criterion: `task web:check`(typecheck+lint), `pnpm test` 통과(신규 테스트 포함). playwriter로 로그인 → `/works`(빈 상태 또는 기존 실 작품 목록) → 새 작품 생성 → 목록에 반영 → 워크스페이스 이름/이니셜이 실 사용자 정보로 표시됨을 UAT(백엔드 가동 시). 불일치는 `run.md`에 기록. (depends: S1–S4)
