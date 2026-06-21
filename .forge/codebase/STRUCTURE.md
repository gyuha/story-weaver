---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# STRUCTURE — web 디렉터리 레이아웃

루트는 monorepo(`api/`, `web/`, `docs/`, `.forge/`). 이 문서는 `web/` 프론트엔드 한정이다.

## web 최상위

```
web/
├── package.json          # pnpm, scripts: dev/build/typecheck/lint/generate
├── vite.config.ts        # tanstackRouter + react + tailwind + tsconfigPaths, proxy /api→:8080, port 3000
├── tsconfig.json         # strict, paths @/* → ./src/*, exclude src/api
├── biome.json            # 2-space, single quote, lineWidth 100, ignore routeTree.gen.ts·src/api
├── openapi-ts.config.*   # pnpm generate 설정 (docs/openapi.json → src/api)
└── src/
```

## src/ 디렉터리

```
src/
├── main.tsx                 # 진입점: RouterProvider 마운트
├── routeTree.gen.ts         # 생성물(수정 금지) — tanstackRouter 플러그인이 빌드 시 생성
├── routes/                  # 파일 기반 라우트 (아래 상세)
├── providers/
│   └── app-providers.tsx    # QueryClientProvider + api-interceptors 설치
├── lib/
│   ├── router.ts            # createRouter + 타입 등록
│   ├── api-client.ts        # createClientConfig (baseURL)
│   ├── api-interceptors.ts  # axios 인터셉터(현재 패스스루)
│   └── utils.ts             # cn() 등 유틸
├── api/                     # 생성물(수정 금지) — openapi-ts 산출, tsc/biome 제외
│   ├── types.gen.ts  sdk.gen.ts  client.gen.ts  index.ts
│   ├── @tanstack/react-query.gen.ts   # 생성된 Query 훅
│   ├── core/  client/
├── components/
│   ├── layout/              # 앱 셸·내비 (아래 상세)
│   ├── ui/                  # 범용 프리미티브 (button, dialog, form, table, modal/ …)
│   ├── dev/form-devtool.tsx
│   └── theme-toggle.tsx
├── features/                # 기능 단위 도메인 (아래 상세)
└── styles/globals.css       # Tailwind v4 엔트리
```

## features/ — 기능 단위 구조

각 도메인은 `src/features/<도메인>/` 아래에 필요한 만큼 `components / store / types / schema / lib / mock / hooks`를 둔다(모든 도메인이 전부 갖는 건 아님). 도메인 횡단 공유물은 `features/shared/`.

```
features/
├── shared/
│   ├── types.ts                 # Work·Scene·Chapter·Entity 등 핵심 도메인 타입
│   ├── store/
│   │   ├── works.store.ts        # useWorksStore (Zustand+immer): 작품·씬 상태와 액션
│   │   └── selectors.ts          # 구독 훅 + 순수 도출 함수(flattenScenes, findChapterNav …)
│   └── mock/works.ts             # seedWorks·seedUsage 시드 데이터
├── auth/
│   ├── components/  (login-page, signup-page, auth-layout, auth-form-parts)
│   ├── store/auth.store.ts       # useAuthStore (persist, key sw-auth) — 목업 인증
│   ├── lib/guard.ts              # requireAuth(redirectTo)
│   ├── schema/auth.schema.ts     # Zod
│   ├── types/auth.ts
│   └── hooks/
├── works/
│   └── components/  (dashboard-screen, work-card, new-work-modal)
├── world-bible/
│   └── components/  (bible-screen, entity-list, entity-detail)
├── editor/
│   └── components/  (editor-screen, manuscript, reading-screen)
├── memory/
│   └── components/  (memory-panel)
├── timeline/
│   └── components/  (timeline-screen)
├── settings/
│   ├── components/  (settings-shell, settings-section, account-screen, llm-screen)
│   ├── store/settings.store.ts
│   ├── schema/settings.schema.ts
│   └── types/settings.ts
└── landing/
    └── components/  (landing-screen)
```

### editor 기능 (강조)

- `editor-screen.tsx` — `WorkShell` 안에 `ManuscriptEditor` + `MemoryPanel`(`features/memory`)을 배치하는 컨테이너.
- `manuscript.tsx` — **Tiptap** 리치텍스트 에디터(`@tiptap/react` + `StarterKit`). 툴바·AI 초안 목업(`MOCK_DRAFT`)·품질 티어 선택 포함. 씬 전환은 상위에서 `key={scene.id}`로 재마운트.
- `reading-screen.tsx` — 읽기 전용 뷰. `read/$chapterId.tsx` 라우트가 챕터 단위 이전/다음 내비와 함께 사용.

## routes/ — 파일 기반 라우트

`tanstackRouter` 플러그인이 이 디렉터리를 스캔해 `src/routeTree.gen.ts`를 생성한다. 라우트는 얇게 — `createFileRoute`로 정의하고 `beforeLoad`(가드·리다이렉트), `useParams`, 셀렉터 조회 후 기능 컴포넌트를 렌더한다.

```
routes/
├── __root.tsx                       # 루트 레이아웃: AppProviders + Outlet + Modals + Toaster
├── index.tsx                        # "/" → LandingScreen (공개)
├── auth/
│   ├── login.tsx                    # validateSearch로 redirect 쿼리 파싱
│   └── signup.tsx
├── settings.tsx                     # "/settings" 레이아웃 라우트(SettingsShell), beforeLoad: requireAuth
├── settings/
│   ├── index.tsx                    # → /settings/account 리다이렉트
│   ├── account.tsx
│   └── llm.tsx
└── works/
    ├── index.tsx                    # "/works" → DashboardScreen (공개)
    ├── new.tsx                       # 새 작품
    └── $workId/
        ├── index.tsx
        ├── bible.tsx  synopsis.tsx  timeline.tsx
        ├── write/
        │   ├── index.tsx            # defaultSceneId 구해 $sceneId로 리다이렉트
        │   └── $sceneId.tsx         # EditorScreen, beforeLoad: requireAuth
        └── read/
            ├── index.tsx
            └── $chapterId.tsx       # ReadingScreen, findChapterNav로 이전/다음 내비
```

가드 적용: 작품 내부(`write/*`, `read/*`)·`settings.tsx`는 `beforeLoad`에서 `requireAuth` 호출. `/`·`/works`는 공개.

## components/layout/

```
layout/
├── top-bar.tsx          # 전역 상단 바: 브랜드 홈 링크 + 가운데 슬롯 + 검색 + UserMenu
├── app-shell.tsx        # 작업 외부 셸 (TopBar + 작품 목록 사이드바 + UsageCard)
├── work-shell.tsx       # 작품 내부 셸 (TopBar + WorkTree 사이드바 + 콘텐츠 슬롯)
├── work-tree.tsx        # 좌측 작업트리(부/챕터/씬)
├── sidebar-parts.tsx    # SidebarShell, WorkspaceHeader, NavItem, SectionLabel, UsageCard
├── user-menu.tsx        # 우상단 사용자 메뉴
└── logo-mark.tsx        # 로고
```

## 파일 네이밍 규칙

- 화면 컴포넌트: `<도메인>-screen.tsx`(예: `dashboard-screen`, `bible-screen`, `editor-screen`, `reading-screen`). 모달은 `*-modal.tsx`, 셸은 `*-shell.tsx`.
- 파일명은 kebab-case. React 컴포넌트 export는 PascalCase, 훅은 `use*` 카멜케이스.
- 스토어: `*.store.ts`, 스토어 훅은 `use<Name>Store`. 셀렉터 훅은 `selectors.ts`에 집중.
- Zod 스키마: `*.schema.ts`. 도메인 타입: `types/<도메인>.ts` 또는 `types.ts`.
- mock 시드: `mock/<name>.ts`, export는 `seed*`/`*` 상수.
- 파라미터 라우트: `$paramName` 접두 파일/디렉터리. 인덱스 라우트: `index.tsx`.
- 생성 파일(`routeTree.gen.ts`, `src/api/**.gen.ts`)은 손대지 않는다.
