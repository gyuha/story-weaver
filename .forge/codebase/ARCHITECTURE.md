---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# ARCHITECTURE — web 프론트엔드

StoryWeaver의 `web/`는 React 19 + Vite 6 + TypeScript(strict) SPA다. 라우팅은 TanStack Router(파일 기반), 서버 상태는 TanStack Query, 클라이언트 상태는 Zustand(+immer)로 분리한다. 스타일은 Tailwind v4, 린트·포맷은 Biome다. 현재는 UI 우선 단계로, 대부분 화면이 실 API 대신 mock 시드 데이터를 Zustand 스토어에 채워 동작한다.

## 아키텍처 패턴 — 기능 단위(feature-sliced)

코드는 기술 레이어가 아니라 **도메인 기능** 단위로 나뉜다. `src/features/<도메인>/` 아래에 `components / store / types / schema / lib / mock`을 두어 각 기능이 자기 완결적이다. 도메인 횡단 공유물은 `src/features/shared/`에, 범용 UI 프리미티브·레이아웃 셸은 `src/components/`에 둔다. 라우트(`src/routes/`)는 얇은 진입점으로, 파라미터를 풀어 셀렉터로 데이터를 조회한 뒤 기능 컴포넌트(`*-screen.tsx`)에 넘긴다.

도메인: `auth · works · world-bible · editor · timeline · memory · settings · landing · shared`.

## 레이어와 데이터 흐름

라우트가 셀렉터로 Zustand 스토어에서 데이터를 읽어 기능 화면 컴포넌트에 주입하고, 컴포넌트는 셸 레이아웃 안에서 렌더된다. 사용자 편집·액션은 스토어 액션을 호출해 immer로 상태를 갱신한다.

```
URL → src/routes/<경로>.tsx (beforeLoad: requireAuth / redirect)
    → useParams로 파라미터 추출
    → features/shared/store/selectors.ts 로 Work/Scene 조회
    → features/<도메인>/components/*-screen.tsx 에 props 주입
    → components/layout/*-shell.tsx (TopBar + Sidebar + 콘텐츠 슬롯)
    ↑ 사용자 액션 → useWorksStore 액션 → immer 갱신 → 셀렉터 구독 컴포넌트 재렌더
```

## 진입점

- `src/main.tsx` — 루트. `#root`에 `<RouterProvider router={router}>`를 `StrictMode`로 마운트하고 `@/styles/globals.css`를 임포트한다.
- `src/lib/router.ts` — `createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })`. 생성된 `routeTree.gen.ts`를 주입하고 `declare module`로 타입을 등록한다.
- `src/routes/__root.tsx` — `createRootRoute`. `<AppProviders>`로 전체를 감싸고 `<Outlet />` + 전역 `<Modals />`(`components/ui/modal/modal-manager`) + `<Toaster />`(sonner)를 렌더, DEV에서 `TanStackRouterDevtools`를 띄운다.
- `src/providers/app-providers.tsx` — `QueryClientProvider`를 세팅(mutations.retry=false)하고 부수효과로 `@/lib/api-interceptors`를 임포트해 axios 인터셉터를 설치한다.

## 라우팅 — 파일 기반 + 빌드 시 생성

`vite.config.ts`의 `tanstackRouter` 플러그인이 `src/routes/`를 스캔해 빌드 시 `src/routeTree.gen.ts`를 생성한다(`autoCodeSplitting: true`). **`routeTree.gen.ts`는 생성물이라 직접 수정 금지**이며 Biome/tsc 대상에서 제외된다. 라우트 추가는 `src/routes/`에 파일을 만들면 되고, `to`/`params` 타입은 `tsc --noEmit`으로 컴파일 타임에 검증된다.

- 파라미터 라우트는 `$workId`, `$sceneId`, `$chapterId`처럼 `$` 접두 디렉터리/파일로 표현한다.
- 부모 레이아웃 라우트: `settings.tsx`(`/settings` 셸)가 `settings/account.tsx` 등 자식의 `<Outlet>` 컨테이너 역할을 한다.
- 인덱스 리다이렉트: `settings/index.tsx`는 컴포넌트 없이 `beforeLoad`에서 `/settings/account`로 `throw redirect`한다. `works/$workId/write/index.tsx`도 `beforeLoad`에서 `defaultSceneId`를 구해 `$sceneId` 라우트로 리다이렉트한다.

## 인증 게이트

`src/features/auth/store/auth.store.ts`의 `useAuthStore`(Zustand + `persist`, localStorage 키 `sw-auth`)가 단일 출처다. **현재는 목업 인증**으로 `isAuthenticated: true`, 시드 유저(`baekya@storyweaver.kr`)가 기본값이며, 실제 토큰/세션은 미도입(Phase 3 예정).

가드는 `src/features/auth/lib/guard.ts`의 `requireAuth(redirectTo)` — 미인증 시 `throw redirect({ to: '/auth/login', search: { redirect: redirectTo } })`. 라우트의 `beforeLoad`에서 호출한다(예: `works/$workId/write/$sceneId.tsx`, `settings.tsx`, `read/$chapterId.tsx`). 단, `/`(`routes/index.tsx` → `LandingScreen`)와 `/works`(`works/index.tsx`)는 가드 없이 공개다. `/auth/login`은 `validateSearch`로 `redirect` 쿼리를 파싱한다.

## 상태 관리 — 서버 vs 클라이언트

- **클라이언트 상태(현재 주력):** Zustand + immer. `features/shared/store/works.store.ts`(작품·씬·타임라인 도메인 상태와 액션), `features/auth/store/auth.store.ts`, `features/settings/store/settings.store.ts`. 셀렉터는 `features/shared/store/selectors.ts`에 모아 두고, 다중 필드 구독은 `useShallow`로 감싼다(`useWorkspaceMeta`).
- **서버 상태:** TanStack Query. `QueryClient`는 `app-providers.tsx`에서 단일 인스턴스로 생성(`mutations.retry: false`). 실제 데이터 패칭 훅은 생성된 `src/api/@tanstack/react-query.gen.ts`에 있으나 기능 연결은 진행 중이라 화면에서 아직 거의 쓰지 않는다.

## mock-store ↔ 생성 API SDK 관계

두 데이터 경로가 공존한다.

1. **mock-store 경로(활성):** `features/*/mock/`의 시드 데이터(예: `features/shared/mock/works.ts`)를 Zustand 스토어 초기값으로 넣고, 화면은 셀렉터로 이를 읽는다. AI 초안 생성·메모리 제안 등도 컴포넌트 내 목업 상수/액션으로 흉내 낸다(예: `manuscript.tsx`의 `MOCK_DRAFT`, `works.store.ts`의 `acceptSuggestion`/`acceptInlineSuggestion`).

2. **생성 API SDK 경로(배선됨, 연결 진행 중):** `pnpm generate`(openapi-ts)가 `docs/openapi.json`에서 `src/api/`의 타입(`types.gen.ts`)·SDK(`sdk.gen.ts`)·TanStack Query 훅(`@tanstack/react-query.gen.ts`)·클라이언트(`client.gen.ts`)를 생성한다. **`src/api/`는 전부 생성물이라 직접 편집 금지**이며 tsc(`tsconfig.json` exclude)·Biome(ignore) 대상에서 제외된다. 런타임 클라이언트 설정은 `src/lib/api-client.ts`(`createClientConfig`, baseURL = `VITE_API_BASE_URL` 또는 `/api`), 인터셉터는 `src/lib/api-interceptors.ts`(현재 요청 인터셉터 패스스루, 토큰 주입/401 갱신은 미구현). 개발 시 Vite 프록시가 `/api` → `http://localhost:8080`로 보낸다(`vite.config.ts`).

전환 계획: 새 화면은 mock-store 패턴을 따르되, 실 API 도입 시 셀렉터/액션을 생성된 Query 훅으로 교체한다.

## 주요 추상화

- **셸 레이아웃** — `components/layout/app-shell.tsx`(작업 외부: 대시보드 등, `TopBar` + 작품 목록 사이드바 + `UsageCard`)와 `components/layout/work-shell.tsx`(작품 내부: `TopBar` + `WorkTree` 작업트리 사이드바 + 콘텐츠 슬롯, `WorkSection = 'write'|'bible'|'synopsis'|'timeline'`). 공통 상단 바는 `top-bar.tsx`(브랜드 홈 링크 + 가운데 슬롯 + 검색 + `UserMenu`).
- **셀렉터/도출 함수** — `selectors.ts`가 스토어 구독 훅(`useWork`, `useEntity`, `useWorks`, `useUsage`, `useWorkspaceMeta`)과 순수 도출 함수(`flattenScenes`, `findSceneLocation`, `findChapterNav`, `defaultSceneId`, `groupChaptersByPart`, `entitiesByType`)를 함께 제공한다. 라우트는 이 도출 함수로 리다이렉트 대상·내비를 계산한다.
- **에디터** — `features/editor/components/editor-screen.tsx`가 `WorkShell` 안에서 `ManuscriptEditor`(좌)와 `MemoryPanel`(우, `features/memory`)을 나란히 놓는다. `ManuscriptEditor`(`manuscript.tsx`)는 **Tiptap**(`@tiptap/react` + `StarterKit`) 기반 리치텍스트 에디터다. 씬 전환 시 `key={scene.id}`로 강제 재마운트해 본문을 다시 채운다(편집은 ephemeral, 스토어에 영속화하지 않음). 읽기 전용 뷰는 `reading-screen.tsx`로, `read/$chapterId.tsx` 라우트가 `findChapterNav`로 챕터 단위 이전/다음 내비와 함께 렌더한다.
- **모달·토스트** — 전역 모달은 `components/ui/modal/`의 `modal-manager`가 `__root.tsx`에서 단일 마운트되어 관리하고, 토스트는 sonner `Toaster`.

## 폼·검증·스타일

- 폼은 react-hook-form + `@hookform/resolvers` + **Zod** 스키마(`features/<도메인>/schema/*.schema.ts`). UI 프리미티브는 Radix/base-ui 기반 `components/ui/`(button, dialog, form, table 등)와 `class-variance-authority` + `tailwind-merge`(`lib/utils.ts`의 `cn`).
- 경로 별칭 `@/*` → `web/src/*`(`tsconfig.json` paths + `vite-tsconfig-paths`).
- Biome: 들여쓰기 2칸 스페이스, 작은따옴표, 줄 폭 100, ES5 trailing comma, organizeImports 활성.
- 테스트 러너 없음. 검증은 `pnpm typecheck` + `pnpm lint`.
