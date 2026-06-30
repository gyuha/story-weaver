<!-- forge-slug: web-auth-session-wiring -->
<!-- task: 22 -->
<!-- tdd: on -->
<!-- priority: high -->
# API 실연동 part 1 — auth 세션 배선 (web)

전체 "web을 실 API로 동작" 작업의 첫 조각. 의존 순서상 인증이 모든 인증 호출의 선행 조건이므로(ADR-0006의 "인증 배선 선행", ADR-0001) auth부터 배선한다. 신규 백엔드는 없다 — auth 엔드포인트와 도메인 facade(`authApi`/`authQueries`/`authMutations`)가 이미 존재하므로 순수 web 작업이다.

## 목표 / 비목표

- 목표: web의 mock 인증(`useAuthStore`의 `isAuthenticated: true` 하드코딩 + 시드 유저)을 실제 백엔드 auth API 연동으로 교체한다. 이메일/비밀번호 로그인·회원가입·로그아웃·세션 복원이 실제로 동작하고, 토큰 인터셉터(Bearer 주입)와 401 단일 refresh가 배선되며, 라우트 가드가 실 세션을 읽는다. web에 테스트 러너(vitest)를 구축하고 핵심 로직을 test-first로 만든다(TDD on).
- 비목표:
  - works·chat·world-bible 등 **다른 도메인 화면의 실 연동**(후속 part — 아래 로드맵).
  - **OAuth 소셜 로그인**(Google/Kakao/Naver redirect+callback) — SocialRow 버튼은 비활성/플레이스홀더 유지.
  - **비밀번호 재설정** 플로우, **verify-email/{token} 랜딩 페이지** — 후속.
  - **관리자 게이팅**(`requireAdmin`의 role 검사) — `/me`에 role이 없어 연기. part 1은 `requireAdmin`을 `requireAuth`로 폴백시키고, role·계정 승인 노출은 후속 admin 도메인 작업에서 설계한다.
  - `web/src/api/**` 생성물 직접 편집(생성물은 `task contract`/`pnpm generate`로만 갱신).
  - 토큰 만료 **선제** 갱신(반응형 401만), httpOnly 쿠키 전환(백엔드 변경 필요 — 범위 밖).

## 진실의 출처

- Glossary terms: 없음 — 이 작업은 사용자 대면 도메인 용어가 아니라 인증·세션 배선 작업이다(구현 세부는 CONTEXT.md에 넣지 않는다).
- Related ADRs:
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0007-frontend-session-token-handling.md` — 세션/토큰 처리 방식(localStorage + 반응형 401 단일 refresh)의 단일 출처.
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0006-code-first-openapi-contract-pipeline.md` — 계약 파이프라인 + "인증 배선 선행".
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0005-users-as-tenant-app-layer-scoping.md` — 사용자/테넌트 스코핑(관리자 게이팅 후속 설계의 근거).
  - `.forge/adr/0001-python-backend-react-frontend.md` — 백/프론트 분리.
- Definition of Done: 브라우저에서 (1) 올바른 자격증명으로 로그인 → `/works` 진입, (2) 새로고침 후에도 세션 유지(`/me` 복원), (3) 로그아웃 후 보호 라우트 접근 시 로그인으로 redirect, (4) 잘못된 자격증명 시 에러 표시, (5) 회원가입 시 "인증 메일 발송" 안내(자동 로그인 없음)가 동작한다. `task web:check`(typecheck+lint)와 `pnpm test`(vitest)가 통과한다.

## 작업 조각

- [ ] S1. web 테스트 러너(vitest) 스캐폴딩 — completion criterion: `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + jsdom 환경이 설치·설정되고, `pnpm test`(및 루트 `task web:test`)로 스모크 테스트 1개가 통과한다. tsconfig/biome가 테스트 파일을 처리하되 `src/api`·`routeTree.gen.ts` 제외는 유지된다.
- [ ] S2. 토큰·세션 store 재작성 — completion criterion (test-first): 토큰 저장/조회/clear, access·refresh를 localStorage에 보관, `isAuthenticated`를 토큰 유무에서 파생하는 로직의 실패 테스트를 먼저 쓰고 통과시킨다. `auth.store.ts`의 mock `isAuthenticated: true`·시드 유저를 제거한다. (depends: S1)
- [ ] S3. 요청 인터셉터 + 401 단일 refresh + 세션 복원 — completion criterion (test-first): (a) 요청 인터셉터가 access 토큰을 `Authorization: Bearer`로 주입, (b) 동시 401 발생 시 refresh가 **1회만** 호출되고 큐된 요청이 재시도되며 refresh 실패 시 세션을 비우고 로그인으로 보낸다(single-flight) — 이 동작의 실패 테스트를 먼저 쓰고 통과시킨다, (c) 앱 로드 시 access 토큰이 있으면 `authApi.me()`로 세션을 복원한다. `api-interceptors.ts`를 재작성한다. (depends: S2)
- [ ] S4. 로그인 페이지 실 연동 — completion criterion (test-first): `login-page`가 `authApi.login`(또는 `authMutations.login`) 호출 → 토큰 저장 → `/me` 복원 → `redirect`(기본 `/works`)로 이어지고, 실패 시 에러를 표시한다. mock `login()` 직접 호출을 제거한다. RTL 테스트로 성공/실패 분기를 검증한다. (depends: S2)
- [ ] S5. 회원가입 페이지 실 연동 — completion criterion (test-first): `signup-page`가 `authApi.signup` 호출 후 **"인증 메일을 보냈습니다" 상태를 표시**하고 자동 로그인·자동 이동을 하지 않는다(실제 백엔드는 토큰 없이 반환·이메일 인증 필요). RTL 테스트로 검증한다. (depends: S2)
- [ ] S6. 라우트 가드 실 연동 — completion criterion (test-first): `requireAuth`가 실 세션(store)을 읽고, `requireAdmin`은 part 1에서 `requireAuth`로 폴백한다(관리자 게이팅 연기). 로그아웃은 `authApi.logout` 호출 + 토큰 clear + 로그인 redirect. 가드 분기의 테스트를 통과시킨다. (depends: S2)
- [ ] S7. 검증 + 문서 — completion criterion: `task web:check`(typecheck+lint)와 `pnpm test`가 통과하고, playwriter로 DoD 5개 시나리오(로그인/세션복원/로그아웃 후 redirect/잘못된 자격증명/회원가입 안내)를 육안 확인한다. 루트 `CLAUDE.md` web 섹션의 "테스트 러너는 아직 없다" 문구를 vitest 도입 사실로 갱신한다. 관리자 게이팅 연기·`/me` role 부재 갭을 `run.md`에 기록한다. (depends: S1–S6)

## 로드맵 (후속 작업 — 각자 별도 fg-ask)

전체 "web 실 API 동작 + 부족 백엔드 신설"의 의존 순서. part 1만 이번에 작성하며, 아래는 차례가 오면 각각 독립 fg-ask로 그릴링한다(여기 순서는 소프트 가이드).

1. **(이 플랜) auth 세션 배선** — web-only, 백엔드 존재.
2. **works 대시보드 실 연동** — web-only, 백엔드 존재(`worksApi`).
3. **chat 실 연동(non-streaming 우선)** — web-only, 백엔드 존재(`chatApi`); SSE 스트리밍은 더 뒤.
4. **world-bible 엔티티 카드** — 백엔드 신설 + heyapi 갱신 + 배선.
5. **집필 계층(부/화/씬) + 씬 본문·버전 기록** — 백엔드 신설 + 배선.
6. **memory(RAG)** — 백엔드 신설 + 배선.
7. **timeline 상태** — 백엔드 신설 + 배선.
8. **settings/references** — 백엔드 + 배선.
9. **admin(계정 승인)** — `/me` role·승인 상태 노출 설계 + part 1에서 연기한 관리자 게이팅 복원.
- (비범위) **image generation** — `docs/image-generation.md` 기준 v2+ 부가 기능, MVP 비범위.
