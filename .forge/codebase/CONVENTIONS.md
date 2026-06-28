---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-26
---

# 코드 컨벤션

StoryWeaver 코드베이스에서 실제로 관찰된 코드 스타일·작성 규칙을 정리한다. 도메인 용어 정의는 여기 범위가 아니며 `.forge/CONTEXT.md`를 따른다.

## web (React + TypeScript)

### 포맷터·린터 — Biome

설정 단일 출처: `web/biome.json` (Biome 1.9.4).

- 들여쓰기: 스페이스 2칸 (`formatter.indentStyle: "space"`, `indentWidth: 2`)
- 줄 폭: 100 (`formatter.lineWidth: 100`)
- 따옴표: 작은따옴표 (`javascript.formatter.quoteStyle: "single"`)
- trailing comma: ES5 (`javascript.formatter.trailingCommas: "es5"`)
- import 자동 정렬 활성 (`organizeImports.enabled: true`)
- 린트 규칙: `recommended`
- Biome 무시 대상(`files.ignore`): `node_modules`, `dist`, `.superpowers`, `.claude`, `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`

명령어(`web/package.json`): `pnpm lint` = `biome check .`, `pnpm lint:fix` = `biome check --write .`, `pnpm format` = `biome format --write .`.

### TypeScript

설정: `web/tsconfig.json`. `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `target: ES2022`, `moduleResolution: Bundler`, `jsx: react-jsx`. 타입 검증은 `pnpm typecheck` = `tsc --noEmit`.

### 경로 별칭

`@/*` → `web/src/*`. 정의 위치: `web/tsconfig.json`의 `compilerOptions.paths`, 런타임은 `vite-tsconfig-paths` 플러그인. 실제 사용 예: `web/src/features/works/components/work-card.tsx` 의 `import { cn } from '@/lib/utils'`, `import type { Work } from '@/features/shared/types'`.

### 파일·심볼 네이밍

- 파일명: kebab-case. 예: `web/src/features/world-bible/components/entity-form.tsx`, `web/src/features/works/components/new-work-modal.tsx`, `web/src/features/editor/lib/word-diff.ts`.
- 스토어 파일은 `*.store.ts`. 예: `web/src/features/shared/store/works.store.ts`, `web/src/features/auth/store/auth.store.ts`, `web/src/features/settings/store/settings.store.ts`.
- 스키마 파일은 `*.schema.ts`. 예: `web/src/features/auth/schema/auth.schema.ts`, `web/src/features/settings/schema/settings.schema.ts`.
- 컴포넌트: PascalCase, named export. 예: `web/src/features/works/components/work-card.tsx`는 `export function WorkCard(...)` 와 `export function NewWorkCard()` 두 개를 named export(파일당 default export 아님).

### 기능 단위 구조

`web/src/features/<도메인>/` 아래 `components / store / types / schema / lib / hooks / mock` 으로 자기 완결. 관찰된 도메인 디렉터리: `auth`, `works`, `world-bible`, `editor`, `timeline`, `memory`, `settings`, `landing`, `shared`. 도메인 공유 코드는 `web/src/features/shared/`. 횡단 코드는 `web/src/lib/`, `web/src/components/` (그 아래 `ui/`, `layout/`, `dev/`).

### Tailwind className 패턴

- Tailwind v4 (`@tailwindcss/vite`). 조건부/병합 className은 `cn(...)` 유틸로 합친다. 정의: `web/src/lib/utils.ts` — `clsx` + `tailwind-merge` 조합(`twMerge(clsx(inputs))`).
- 다중 클래스·조건 분기는 `cn('base...', cond && '...')` 형태. 예: `web/src/features/works/components/work-card.tsx` 의 `<Link className={cn('block overflow-hidden ...', work.status === '연재 중' && 'shadow-[...]' )}>`.
- 임의값(arbitrary value)을 폭넓게 사용. 예: `text-[11px]`, `p-[16px_18px]`, `rounded-[10px]`, `bg-[#edf3ec]`, `tracking-[0.05em]`.
- 색·간격 토큰을 의미 이름으로 사용(theme에 정의). 예: `bg-paper`, `border-line`, `text-ink`, `text-muted-ink`, `text-faint`, `bg-surface-soft`, `border-line-strong`.

### Zustand + immer 스토어 작성 패턴

기준 파일: `web/src/features/shared/store/works.store.ts`.

- `create<State>()(immer((set, get) => ({ ... })))` 형태. immer 미들웨어는 `zustand/middleware/immer`.
- State 인터페이스에 상태 필드와 액션을 함께 선언(예: `interface WorksState`). 초기 상태는 `mock/`의 시드 데이터로 채운다(`works: seedWorks`).
- 액션은 immer 드래프트를 **직접 변이**한다. 예: `state.works.unshift({...})`, `chapter.title = title`, `scene.linkedEntityIds.push(id)`. 불변 복사본 반환을 하지 않는다.
- 새 id 생성/반환이 필요한 액션은 `set` 바깥에서 id를 먼저 만들고(`const id = `work-${Date.now().toString(36)}``) `set(...)` 안에서 사용한 뒤 그 id를 return한다(예: `addWork`, `addChapter`, `addEntity`).
- 파생 액션은 `get()`으로 다른 액션/상태를 재사용한다(예: `addPart`가 `get().addChapter(...)` 호출).
- 모듈 하단에 스토어 전용 헬퍼 함수를 둔다(예: `function findScene(...)`).
- 인라인 한국어 주석으로 의도를 설명(JSDoc `/** ... */`로 액션 시그니처에 설명 부착).
- 영속화가 필요한 스토어는 `persist` 미들웨어 사용. 예: `web/src/features/auth/store/auth.store.ts` — `create<AuthState>()(persist((set) => ({...}), { name: 'sw-auth' }))`. 이 스토어는 immer 없이 `set({...})` 객체 머지 형태를 쓴다(단순 상태라 immer 불필요).

### TanStack Router — 타입드 라우트

파일 기반 라우팅. 라우트 파일은 `web/src/routes/`, 빌드 시 `@tanstack/router-plugin`이 `web/src/routeTree.gen.ts`를 생성(autoCodeSplitting).

- 각 라우트 파일은 `createFileRoute('<경로>')({ component, beforeLoad? })`로 `Route`를 export. 예: `web/src/routes/index.tsx`, `web/src/routes/works/$workId/write/$sceneId.tsx`.
- 동적 세그먼트는 파일명 `$param` 표기. 예: `web/src/routes/works/$workId/write/$sceneId.tsx` → 경로 `/works/$workId/write/$sceneId`.
- params 접근은 `useParams({ from: '/works/$workId/write/$sceneId' })` — `from`에 타입드 경로 리터럴을 넘긴다.
- 내비게이션은 `<Link to="/works/$workId/write" params={{ workId: work.id }} />` — `to`/`params`가 컴파일 타임 검증된다(예: `web/src/features/works/components/work-card.tsx`).
- 인증 게이트는 라우트 `beforeLoad`에서 `requireAuth(...)` 호출. 정의: `web/src/features/auth/lib/guard.ts`. 사용 예: `web/src/routes/works/$workId/write/$sceneId.tsx`. 진입점 redirect 판단은 `web/src/routes/index.tsx` 계열(루트 게이트는 `useAuthStore` 기반, `CLAUDE.md` 참조 — 현재 `index.tsx`는 랜딩 화면을 렌더).

### 생성물 — 직접 편집 금지

- `web/src/routeTree.gen.ts` — TanStack Router 플러그인 생성물. 수정 금지.
- `web/src/api/**` — `pnpm generate`(`@hey-api/openapi-ts`)가 `docs/openapi.json`에서 생성하는 타입·SDK·TanStack Query 훅. 직접 편집 금지. `web/tsconfig.json`의 `exclude`와 `web/biome.json`의 `files.ignore` 모두에서 제외됨.
- API 클라이언트 설정은 `web/src/lib/api-client.ts`(baseURL = `VITE_API_BASE_URL` 또는 `/api`), 인터셉터는 `web/src/lib/api-interceptors.ts`.

## api (FastAPI + Python)

근거 문서: `api/CLAUDE.md`, `api/pyproject.toml`.

### 포맷터·린터 — Ruff

설정: `api/pyproject.toml`의 `[tool.ruff]`.

- `target-version = "py312"`, `line-length = 100`, `src = ["src"]`.
- 린트 select: `E, W, F, I, N, UP, B, C4, SIM, ANN, S, T20, PT, RUF`.
- 전역 ignore: `ANN401`(동적 kwargs), `S101`(assert), `B008`(FastAPI DI 기본값).
- per-file-ignores: `tests/**`는 assert·타입주석·print 등 대폭 완화, `alembic/**`·`scripts/**`도 별도 완화(`api/pyproject.toml`의 `[tool.ruff.lint.per-file-ignores]`).
- 포맷: `quote-style = "double"`(큰따옴표 — web과 반대), `indent-style = "space"`, `line-ending = "lf"`.

### 타입 — mypy strict

`[tool.mypy]`: `python_version = "3.12"`, `strict = true`, `mypy_path = ["src"]`, `plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]`. 프로토타입 단계 완화: `disallow_any_generics = false`, `warn_return_any = false`. 외부 라이브러리(`fastapi_mail`, `passlib`, `jose`, `langchain*`, `litellm` 등)는 `ignore_missing_imports`.

### 구조 — Light Modular Monolith (DDD), src layout

`api/src/`가 Python path 루트(`PYTHONPATH=src`). 각 도메인은 `api/src/domains/<bc>/` 아래 `router / service / repository / models / schemas`로 자기 완결.

- 횡단 관심사: `api/src/core/`(config, database, redis, middleware, exceptions).
- 도메인: `api/src/domains/auth/`, `api/src/domains/chat/`, `api/src/domains/shared/`.
- 외부 어댑터: `api/src/infra/`.
- 하위 모듈 파일명에 도메인 접두 사용. 예: `api/src/domains/auth/router/auth_router.py`, `api/src/domains/auth/service/auth_service.py`. 도메인 루트 직속 단일 책임 파일은 짧게(`security.py`, `email.py`).

### 규칙(`api/CLAUDE.md`)

- 도메인 간 직접 DB 모델 import 금지 — 경계 넘는 참조는 ID 또는 이벤트로.
- src layout 유지 — import는 `src` 기준(예: `from core.exceptions import UnauthorizedError`, `from domains.auth.router import router`).
- mypy strict·ruff 통과가 기본. 커밋 전 `task lint`.
- Alembic 마이그레이션은 항상 리뷰 후 커밋(autogenerate SQL 검토).
- 비밀값은 `.env`(로컬)·`.env.prod`(운영). 커밋 금지. `detect-secrets` pre-commit 사용.

### 코드 스타일 관찰

- 모든 모듈 상단 `from __future__ import annotations`(예: `api/tests/auth/test_login_route.py`, `api/tests/conftest.py`).
- 모듈/함수에 docstring(한국어 또는 영어). 스크립트는 한국어 docstring 다수(예: `api/scripts/smoke_test.py`).
- 타입 힌트 필수(ruff `ANN`, mypy strict).
