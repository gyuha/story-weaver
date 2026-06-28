---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-27
---

# StoryWeaver 아키텍처

monorepo 두 축: `web/`(React 프론트엔드)와 `api/`(FastAPI 백엔드). 제품 설계 문서는 `docs/`, 도메인 용어·결정 기록은 `.forge/`에 있다. 현 단계는 web이 mock 데이터로 화면을 구동하는 UI 우선 단계이며, 실 API 클라이언트는 배선만 되어 있고 기능 연결은 진행 중이다.

---

## web — 전체 패턴

React 19 + Vite 6 + TypeScript(strict). 기능 단위(feature-based) 구조로, 화면 로직은 `web/src/features/<도메인>/` 아래에 자기 완결적으로 모여 있고, 라우트 파일(`web/src/routes/`)은 얇은 어댑터로서 feature 컴포넌트를 마운트한다.

### 레이어

1. **라우트 레이어** — `web/src/routes/`. TanStack Router 파일 기반. 각 라우트는 URL 파라미터/검색값을 읽어 feature 화면 컴포넌트에 props로 넘긴다. 인증/권한 게이트는 라우트의 `beforeLoad`에서 `requireAuth`·`requireAdmin`으로 건다.
2. **feature 레이어** — `web/src/features/<도메인>/`. 화면 컴포넌트, 클라이언트 상태(store), 타입, 스키마, 헬퍼(lib), mock 시드를 담는다.
3. **공유 UI/레이아웃 레이어** — `web/src/components/`. `ui/`(디자인 시스템 원자 컴포넌트, shadcn/Radix/Base UI 기반 — `components.json` 설정), `layout/`(app-shell·top-bar·user-menu·work-shell·work-tree 등 셸), `dev/`(개발 도구).
4. **인프라/플러밍 레이어** — `web/src/lib/`(router·api-client·api-interceptors·utils), `web/src/providers/`(app-providers), `web/src/stores/`(modal-store), `web/src/hooks/`, `web/src/styles/`.
5. **생성물 레이어** — `web/src/api/`(OpenAPI에서 생성한 SDK·타입·Query 훅), `web/src/routeTree.gen.ts`(라우터 플러그인 생성). 둘 다 직접 편집 금지.

### 진입점

- `web/index.html` → `web/src/main.tsx`. `main.tsx`는 `globals.css`를 로드하고 `RouterProvider`(라우터는 `web/src/lib/router.ts`)를 `#root`에 마운트한다(StrictMode).
- 라우트 트리 루트는 `web/src/routes/__root.tsx` — `RootComponent`가 `AppProviders`로 감싸고 `<Outlet/>` + 모달 매니저(`Modals`) + 토스트(`Toaster`) + DEV 전용 라우터 devtools를 렌더한다.
- `web/src/providers/app-providers.tsx` — `QueryClientProvider`(TanStack Query)를 제공하고, side-effect import로 `@/lib/api-interceptors`를 적재한다. mutation `retry: false`.
- URL `/` 자체는 현재 `LandingScreen`을 렌더한다(`web/src/routes/index.tsx`). CLAUDE.md가 언급한 "index가 인증 판단해 redirect"와는 현재 코드가 다르다 — 인증 게이트는 개별 라우트의 `beforeLoad`에 분산돼 있다.

### 상태 레이어 (이중 구조)

- **서버 상태 = TanStack Query** (`@tanstack/react-query`). 클라이언트는 `web/src/providers/app-providers.tsx`에서 1개 `QueryClient`로 제공. Query 훅은 `web/src/api/@tanstack/`에 생성된다. 현재 화면들은 아직 이 훅 대신 mock-store를 쓴다.
- **클라이언트 상태 = Zustand + immer** (`zustand`, `zustand/middleware/immer`). feature별 store가 핵심 클라이언트 상태를 보유한다.

주요 store:
- `web/src/features/shared/store/works.store.ts` — `useWorksStore`. 작품·엔티티·챕터·씬·타임라인·충돌 등 거의 모든 작품 도메인 상태를 immer로 보유. mutation 액션이 풍부하다(addWork·addEntity·updateEntity·addChapter/addPart·renamePart·deleteChapter/deletePart·addSceneEntityLinks·restoreSceneVersion·accept/dismissSuggestion 등). 초기값은 `web/src/features/shared/mock/works.ts`의 시드(`seedWorks`·`seedUsage`·`workspaceName`·`authorInitial`).
- `web/src/features/auth/store/auth.store.ts` — `useAuthStore`. `persist` 미들웨어로 localStorage 키 **`sw-auth-v2`**에 영속(`zustand/middleware`의 `persist`). 현재 목업 인증으로 `isAuthenticated: true` 기본, 시드 유저는 `{ email: 'baekya@storyweaver.kr', role: 'ADMIN' }`. 키를 `sw-auth` → `sw-auth-v2`로 버전업한 이유는 시드 role(`ADMIN`) 변경이 기존 localStorage에 막히지 않게 하기 위함(주석). 유저 타입 `AuthUser`(`web/src/features/auth/types/auth.ts`)의 `role`은 `'USER' | 'ADMIN'`.
- `web/src/features/admin/store/admin.store.ts` — `useAdminStore`. immer. 회원 목록(`members: Member[]`)을 `web/src/features/admin/mock/members.ts`의 `seedMembers`로 초기화하고 `approveMember`·`rejectMember` 액션으로 상태(`pending|approved|rejected`)를 메모리상 갱신.
- `web/src/features/settings/store/settings.store.ts` — 설정 화면 상태.
- `web/src/stores/modal-store.ts` (`web/src/stores/modal.types.ts`) — 전역 모달 매니저 상태.

store에서 파생값을 뽑는 selector 모음은 `web/src/features/shared/store/selectors.ts`: `useWorks`·`useWork`·`useEntity`·`useUsage`·`useWorkspaceMeta`(useShallow), 그리고 순수 헬퍼 `flattenScenes`·`findSceneLocation`·`findChapterNav`·`defaultSceneId`·`groupChaptersByPart`·`entitiesByType`.

### 라우팅

- TanStack Router 파일 기반. `@tanstack/router-plugin`이 빌드 시 `web/src/routes/`를 스캔해 `web/src/routeTree.gen.ts`를 생성(`autoCodeSplitting: true`). 설정은 `web/vite.config.ts`의 `tanstackRouter` 플러그인.
- 라우터 인스턴스는 `web/src/lib/router.ts`: `createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })` + 타입 등록(`Register`).
- 라우트 정의 관용구: 각 파일이 `createFileRoute('<path>')({...})`로 `Route`를 export. 레이아웃 라우트(`component: AdminShell`·`bible.tsx`의 `Outlet`)가 하위 중첩 자식(`admin/index.tsx`·`admin/stats.tsx`, `bible.index.tsx`·`bible.new.tsx`·`bible.edit.tsx`)을 `<Outlet/>`에 렌더한다. URL 검색 파라미터는 `validateSearch`로 타입 검증(예: `bible.index.tsx`·`bible.edit.tsx`의 `entity` 검색값 → `{ entity?: string }`).

### 라우트 레벨 인증/권한 게이팅

- 가드 모듈: `web/src/features/auth/lib/guard.ts`.
  - `requireAuth(redirectTo)` — `useAuthStore.getState().isAuthenticated`가 false면 `throw redirect({ to: '/auth/login', search: { redirect: redirectTo } })`.
  - `requireAdmin(redirectTo)` — 먼저 `requireAuth(redirectTo)`를 호출한 뒤 `useAuthStore.getState().user?.role !== 'ADMIN'`이면 `throw redirect({ to: '/works' })`. (비관리자는 로그인은 됐어도 `/works`로 튕긴다.)
- 사용처: `web/src/routes/admin.tsx`의 `beforeLoad: () => requireAdmin('/admin')`. 작품 하위 라우트(`bible.tsx`·`bible.new.tsx`·`bible.edit.tsx` 등)는 `beforeLoad: ({ params }) => requireAuth(...)`.
- UI 측 권한 분기: 상단 사용자 메뉴 `web/src/components/layout/user-menu.tsx`는 `user?.role === 'ADMIN'`일 때만 "관리자"(`/admin`) 링크를 노출한다. 라우트 가드와 별개의 표시 제어로, 가드가 실제 접근 차단을 담당한다.

### API 레이어

- 백엔드 호출 코드는 전부 생성물. `pnpm generate`(`openapi-ts.config.ts`)가 `docs/openapi.json`을 입력으로 `web/src/api/`에 SDK·타입·클라이언트·TanStack Query 훅을 생성한다. 플러그인: `@hey-api/client-axios`·`@hey-api/typescript`·`@hey-api/sdk`·`@tanstack/react-query`. `web/src/api/`는 직접 편집 금지(tsc/biome 제외 대상).
- 런타임 클라이언트 설정: `web/src/lib/api-client.ts`의 `createClientConfig` — `baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'`. openapi-ts가 이 파일을 `runtimeConfigPath`로 끌어 쓴다.
- 인터셉터: `web/src/lib/api-interceptors.ts` — 현재는 패스스루(`client.instance.interceptors.request.use((config) => config)`). 실제 토큰 주입·401 갱신은 Phase 3로 예정(주석).
- 로컬 프록시: `web/vite.config.ts`가 `/api` → `http://localhost:8080`으로 보내며 `^/api` 프리픽스를 제거(`rewrite`). (api 기본 dev 포트 `:8000`과 불일치 주의.)

### 현재 단계 — UI 우선 / mock-store

대부분의 화면은 실 API가 아니라 `web/src/features/*/mock/`의 시드 데이터를 Zustand store에 채워 동작한다. 대표적으로 `web/src/features/shared/mock/works.ts` → `web/src/features/shared/store/works.store.ts`, 그리고 신규 `web/src/features/admin/mock/members.ts` → `web/src/features/admin/store/admin.store.ts`. 사용자 액션(작품·엔티티·챕터 추가/수정/삭제, 회원 승인/거부)은 store의 immer 액션으로 메모리상에서만 반영된다. 관리자 통계 화면(`admin-stats-screen.tsx`)도 `useAdminStore`·`useWorksStore`에서 집계한 mock 수치다. 실 API 전환 시 이 자리를 생성된 Query 훅(`web/src/api/@tanstack/`)으로 교체하는 것이 의도된 경로다.

데이터 흐름(현재): 라우트가 URL 파라미터 파싱 → selector(`useWork` 등) 또는 store 훅으로 상태를 읽음 → feature 화면 컴포넌트에 props 전달 → 사용자 액션은 store 액션 호출 → immer가 상태 갱신 → 구독 컴포넌트 리렌더.

```
URL → routes/*.tsx (params/search) → selectors → features/*/components 화면
                                          ↑                  ↓ 사용자 액션
                                    Zustand store ←──── store 액션(immer)
                                          ↑
                                    features/*/mock 시드
```

실 API 전환 후 흐름(의도): `features 화면 → web/src/api/@tanstack Query 훅 → api-client(axios) → /api 프록시 → FastAPI`.

---

## api — 백엔드 아키텍처

근거: `api/CLAUDE.md`와 `api/src/` 구조.

패턴: **Light Modular Monolith (DDD)**. `api/src/`가 Python path 루트(PYTHONPATH=src). 진입점은 `api/src/main.py`(FastAPI 인스턴스 정의처), 모듈 실행은 `api/src/__main__.py`.

스택: Python ≥ 3.12, FastAPI + Uvicorn, 패키지 매니저 uv. PostgreSQL(asyncpg) + SQLAlchemy(async) + Alembic, Redis. 인증은 JWT(python-jose) + argon2 + OAuth(google/kakao/naver) + RBAC. LLM은 LangChain + langchain-litellm(provider 교체는 `LLM_PROVIDER` 환경변수). 품질: ruff·mypy(strict)·pytest.

### 레이어 / 디렉터리

- `api/src/core/` — 횡단 관심사. `config.py`·`database.py`·`redis.py`·`middleware.py`·`exceptions.py`·`logging.py`.
- `api/src/domains/<bc>/` — 바운디드 컨텍스트별 자기 완결 모듈. 각 도메인은 `router / service / repository / models / schemas` 5계층 구조.
  - `api/src/domains/auth/` — 인증·인가(JWT + OAuth + RBAC). `oauth/`(google·kakao·naver), `security.py`, `email.py` 포함.
  - `api/src/domains/chat/` — LLM 프록시·SSE 스트리밍(집필 LLM의 기반). 표준 5계층 외에 `container.py`·`ports.py`·`llm_client.py`·`llm_factory.py`(헥사고날 포트/팩토리 패턴).
  - `api/src/domains/shared/` — 도메인 공유 기반. `base.py`·`events.py`·`types.py`.
- `api/src/infra/` — 외부 시스템 어댑터. `llm/provider_factory.py`.
- `api/alembic/` — DB 마이그레이션(`versions/0001_initial_schema.py` 등). 설정 `api/alembic.ini`.

도메인당 5계층 호출 방향: `router(HTTP) → service(유스케이스) → repository(영속화) ↔ models(SQLAlchemy)`, 입출력 직렬화는 `schemas`(Pydantic).

### 규칙 (api)

- **도메인 간 직접 DB 모델 import 금지** — 경계를 넘는 참조는 ID 또는 이벤트로(`domains/shared/events.py`).
- **src layout** 유지(import는 `src` 기준).
- mypy strict·ruff 통과 기본. Alembic 마이그레이션은 항상 리뷰 후 커밋(autogenerate SQL 검토).
- 비밀값은 `api/.env`(로컬)·`.env.prod`(운영). 커밋 금지.

---

## 빌드/검증 도구

- web: 패키지 매니저 pnpm(Node ≥ 22.18). `pnpm dev`(포트 3000)·`pnpm build`(`tsc -b && vite build`)·`pnpm typecheck`·`pnpm lint`(Biome)·`pnpm generate`. 테스트 러너 미설정 — 검증은 typecheck + lint.
- api: `task dev`·`task test`(pytest)·`task lint`(ruff + mypy)·`task format`·`task migrate`.
- 경로 별칭: `@/*` → `web/src/*`.
- 생성 파일 `web/src/routeTree.gen.ts`·`web/src/api/**`는 손대지 않는다.
