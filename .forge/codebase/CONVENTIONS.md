---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# CONVENTIONS — web 프론트엔드 코드 컨벤션

이 문서는 `web/` 디렉터리의 실제 구현에서 관찰된 코드 스타일·패턴을 기록한다. 도메인 용어 정의는 `CONTEXT.md`에 있으며 여기서는 다루지 않는다.

## 포매팅 / 린트 (Biome)

단일 출처는 `web/biome.json`이다. `@biomejs/biome` 1.9.4를 쓴다.

- 들여쓰기: 스페이스 2칸 (`indentStyle: "space"`, `indentWidth: 2`)
- 줄 폭: 100 (`lineWidth: 100`)
- 따옴표: 작은따옴표 (`quoteStyle: "single"`)
- trailing comma: ES5 (`trailingCommas: "es5"` — 객체·배열 끝에는 콤마, 함수 인자 끝에는 콤마 없음)
- import 자동 정렬 활성화 (`organizeImports: true`)
- 린트 규칙은 Biome `recommended`만 사용 (커스텀 룰 없음)
- Biome 제외 대상(`files.ignore`): `node_modules`, `dist`, `.superpowers`, `.claude`, `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`

명령(`web/package.json` scripts, pnpm):

- `pnpm lint` → `biome check .`
- `pnpm lint:fix` → `biome check --write .`
- `pnpm format` → `biome format --write .`
- `pnpm typecheck` → `tsc --noEmit`
- `pnpm build` → `tsc -b && vite build`
- `pnpm dev` → `vite` (포트 3000, `web/vite.config.ts`)

패키지 매니저는 pnpm 10.28.2, Node ≥ 22.18 (`engines`).

## 경로 별칭

`@/*` → `web/src/*`. `web/tsconfig.json`의 `paths`에 정의되고, Vite는 `vite-tsconfig-paths` 플러그인으로 동일 해석한다(`web/vite.config.ts`). import 예: `import { cn } from '@/lib/utils';`, `import { useWorksStore } from '@/features/shared/store/works.store';`. 같은 기능 폴더 내부 참조는 상대 경로(`../mock/works`, `../types`)도 혼용한다.

## 디렉터리 / 기능 단위 구조

`src/features/<도메인>/` 아래 `components / store / types / schema / lib / mock`로 자기 완결. 관찰된 도메인: `auth · landing · works · world-bible · editor · timeline · memory · settings · shared`. 도메인 공유 코드는 `features/shared/`(예: `features/shared/store/works.store.ts`, `features/shared/types.ts`, `features/shared/mock/works.ts`).

전역 인프라는 기능 밖에 둔다: `src/lib/`(`utils.ts`, `router.ts`, `api-client.ts`, `api-interceptors.ts`), `src/components/ui/`(디자인 시스템 프리미티브), `src/components/layout/`, `src/stores/`(전역 모달 등), `src/routes/`(파일 기반 라우트), `src/providers/`.

## 네이밍

- 파일명: kebab-case (`work-card.tsx`, `new-work-modal.tsx`, `auth.schema.ts`, `works.store.ts`). 스토어는 `<도메인>.store.ts`, 스키마는 `<도메인>.schema.ts`, 타입은 `<도메인>.ts` 또는 `types.ts`.
- 컴포넌트: PascalCase 함수 컴포넌트, `export function Xxx()` 형태(default export 미사용, 단 `src/stores/modal-store.ts`의 `useModal`은 default export). 한 파일에 주 컴포넌트 + 보조 컴포넌트(`FieldLabel`, `Steps` 등 파일 하단 비-export 헬퍼)를 함께 둔다.
- 훅/셀렉터: `use` 접두사 (`useWorks`, `useWork`, `useEntity`, `useWorkspaceMeta`).
- 스토어 상태 인터페이스: `XxxState` (`WorksState`, `AuthState`, `SettingsState`).
- 식별자/주석은 한국어를 적극 사용. JSDoc 주석도 한국어(`/** 작품 내 모든 씬을 ... */`).

## 컴포넌트 패턴

- React 19 함수 컴포넌트 + TypeScript strict. props는 인라인 타입 또는 별도 인터페이스. 작은 컴포넌트는 `{ work }: { work: Work }`처럼 인라인.
- 디자인 시스템 프리미티브(`src/components/ui/*`)는 `@base-ui/react`·`radix-ui`를 기반으로 하고 변형은 `class-variance-authority`(cva)로 정의한다(`button.tsx`, `badge.tsx`, `alert.tsx`, `tabs.tsx`, `input-group.tsx`). 패턴: `const xxxVariants = cva(base, { variants, defaultVariants })` → 컴포넌트에서 `cn(xxxVariants({ variant, size, className }))`. props 타입은 `Primitive.Props & VariantProps<typeof xxxVariants>`. `data-slot` 속성으로 슬롯 식별.
- 폼: `react-hook-form` + `@hookform/resolvers`로 zod 스키마를 resolver에 연결.
- 라우팅 내비게이션: `@tanstack/react-router`의 `<Link to=... params=...>`, `useNavigate()`, `useParams({ from: ... })`. `to`/`params`는 컴파일 타임 타입 검증됨. 라우트 가드는 `beforeLoad`에서 `requireAuth(...)`(`src/features/auth/lib/guard.ts`) 호출 후 미인증 시 `throw redirect(...)`. 데이터 부재 시에도 `beforeLoad`에서 `throw redirect({ to: '/works' })`.
- 아이콘은 `lucide-react`. 애니메이션은 `motion`, `tw-animate-css`.

## Tailwind v4 + 디자인 토큰

Tailwind v4(`@tailwindcss/vite`)를 쓰며 설정 파일 없이 `web/src/styles/globals.css`의 `@theme inline` 블록에서 색 토큰을 정의한다. CSS 변수(`:root`/`.dark`)를 `--color-*`로 매핑해 Tailwind 유틸리티(`bg-*`, `text-*`, `border-*`)로 노출한다.

StoryWeaver 전용 토큰(Notion 스타일 warm-paper 팔레트): `paper`, `board`, `surface`, `surface-soft`, `ink`, `ink-soft`, `muted-ink`, `faint`, `faintest`, `line`, `line-strong`, `ai`, `ai-soft`, `success`, `genre`, `danger`, `danger-soft`. shadcn 계열 토큰(`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `ring`, `sidebar-*`, `chart-*`)도 병존. 다크 모드는 `.dark` 클래스 변형(`@custom-variant dark`).

사용 관례:

- 토큰 유틸리티 우선: `bg-paper`, `text-ink`, `text-muted-ink`, `border-line`, `text-faint`, `text-ai` 등.
- 토큰에 없는 값은 임의값(arbitrary value)으로 직접 지정: `text-[12.5px]`, `bg-[#edf3ec]`, `rounded-[10px]`, `p-[16px_18px]`, `bg-[rgba(15,15,15,0.30)]`, `shadow-[0_1px_3px_rgba(15,15,15,0.05)]`. 픽셀 단위 디자인 목업을 그대로 옮긴 흔적이 많다.
- 폰트: 본문 `font-sans`(Noto Sans KR), 작품 제목·소설 본문 등 세리프는 `font-serif`(Noto Serif KR).
- 조건부 클래스는 `cn()`(`src/lib/utils.ts` — `clsx` + `tailwind-merge`)로 합성. 예: `cn('block ...', work.status === '연재 중' && 'shadow-...')`.
- 색 변형 테이블은 컴포넌트 상단 상수 객체로 둔다(예: `work-card.tsx`의 `THEME: Record<Work['coverTheme'], {...}>`).
- tiptap 편집 본문(`.sw-editor *`) 같은 contenteditable 스타일은 `globals.css`에 직접 작성(typography 플러그인 미사용).

## 상태 관리 — Zustand

서버 상태는 `@tanstack/react-query`, 클라이언트 상태는 `zustand` 5 + `immer` 미들웨어.

스토어 액션 패턴(`features/shared/store/works.store.ts`):

- `create<XxxState>()(immer((set) => ({ ...초기값, action: (args) => set((state) => { state.xxx... }) })))`. immer 덕분에 `state.works.unshift(...)`, `scene.aiSuggestion = undefined`처럼 직접 변이 작성.
- 새 항목 id는 `` `work-${Date.now().toString(36)}` ``처럼 타임스탬프 기반(목업 단계라 서버 id 없음).
- 값을 반환하는 액션은 `set` 밖에서 id를 만들어 `set` 호출 후 `return id`(예: `addWork`).

영속화 패턴(`auth.store.ts`, `settings.store.ts`):

- `create<XxxState>()(persist((set) => ({...}), { name: 'sw-xxx' }))`로 localStorage 저장(`sw-auth`, `sw-settings`). immer 없이 `set((s) => ({ profile: { ...s.profile, ...patch } }))` 형태 부분 갱신.
- 전역 모달 스토어(`src/stores/modal-store.ts`)는 `devtools` 미들웨어 사용, default export `useModal`.

셀렉터 분리(`features/shared/store/selectors.ts`):

- 스토어를 직접 구독하지 않고 셀렉터 훅으로 감싼다: `useWorks`, `useUsage`, `useWork(workId)`, `useEntity(workId, entityId)`.
- 여러 필드를 한 번에 뽑을 때는 `useShallow`로 리렌더 억제(`useWorkspaceMeta`).
- 파생 로직(순수 함수)은 같은 파일에 비-훅으로 둔다: `flattenScenes`, `findSceneLocation`, `findChapterNav`, `defaultSceneId`, `groupChaptersByPart`, `entitiesByType`. 라우트 `beforeLoad`에서는 훅 대신 `useWorksStore.getState()`로 비반응형 접근.

## Mock 데이터 시딩

현재 UI 우선 단계라 대부분 화면이 mock 시드를 스토어에 채워 동작한다.

- 시드 데이터는 `features/<도메인>/mock/`에 타입이 붙은 상수로 작성(`features/shared/mock/works.ts`의 `seedWorks`, `seedUsage`, `workspaceName`, `authorInitial`). 디자인 목업과 일관된 예시 콘텐츠(무협 회귀물 등)를 한국어로 둔다.
- 스토어 초기 상태가 시드를 직접 가리킨다: `works: seedWorks`, `usage: seedUsage`. 별도 hydrate 단계 없음.
- `auth.store`/`settings.store`는 mock 사용자를 인라인 초기값으로 두고 localStorage 영속화. 인증 초기값이 `isAuthenticated: true`(작가 백야 시드 로그인 상태).
- 실 API 전환 시 생성된 Query 훅으로 교체할 예정(코드 주석에 Phase 3/ADR 참조 기재).

## 토스트 (sonner)

- 전역 `<Toaster />`(`src/components/ui/sonner.tsx`, sonner 래퍼)를 루트 라우트(`src/routes/__root.tsx`)에 1회 마운트.
- 사용처에서 `import { toast } from 'sonner'` 후 `toast.success('...')`(성공) 또는 `toast('...')`(중립/목업 안내) 호출. 메시지는 한국어. 미구현 동작은 `'... (목업)'` 접미사 관례(`manuscript.tsx`, `timeline-screen.tsx`, `auth-form-parts.tsx`, `memory-panel.tsx`).

## 에러 처리 / 유효성 검사

- 폼 유효성은 zod 스키마(`features/<도메인>/schema/*.schema.ts`)로 선언, 메시지는 한국어. cross-field 검증은 `.refine(..., { path: [...] , message })`(비밀번호 확인 일치 등 — `auth.schema.ts`, `settings.schema.ts`).
- 스키마에서 `z.infer<typeof xxxSchema>`로 폼 값 타입을 파생(`LoginFormValues`, `ProfileFormValues` 등).
- 라우트 레벨 방어는 `beforeLoad`의 `throw redirect(...)`(미인증·데이터 부재). 현재 목업 단계라 try/catch 기반 네트워크 에러 처리·전역 에러 바운더리는 관찰되지 않음. API 인터셉터(`src/lib/api-interceptors.ts`)는 토큰 주입·401 갱신을 Phase 3로 미뤄 둔 스텁 상태.

## API 레이어 (생성물, 직접 편집 금지)

`docs/openapi.json` → `pnpm generate`(openapi-ts, `web/openapi-ts.config.ts`)로 `src/api/`에 타입·SDK·TanStack Query 훅 생성. `src/api/`와 `src/routeTree.gen.ts`는 생성물이라 손대지 않으며 Biome/tsc 제외. 클라이언트 baseURL은 `src/lib/api-client.ts`(`VITE_API_BASE_URL ?? '/api'`). dev에서는 Vite 프록시가 `/api` → `http://localhost:8080`으로 rewrite(`web/vite.config.ts`).
