---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# STACK

StoryWeaver는 monorepo다. `web/`(React 프론트엔드)와 `api/`(FastAPI 백엔드)로 나뉜다. 현재 UI 우선(mock) 단계로, web 화면 대부분이 mock 시드 데이터를 Zustand 스토어에 채워 동작하며 실 API 연결은 진행 중이다.

## web — 언어·런타임

- TypeScript 5.8(strict), `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `jsx: react-jsx`. 설정은 `web/tsconfig.json`(빌드용 `web/tsconfig.node.json` 참조).
- strict 외에 `noUnusedLocals`·`noUnusedParameters`·`noFallthroughCasesInSwitch` 활성. `src/api`는 컴파일 대상에서 제외(`exclude`).
- Node ≥ 22.18.0, 패키지 매니저 pnpm@10.28.2 고정(`web/package.json`의 `packageManager`·`engines`). pnpm 워크스페이스 매니페스트는 `web/pnpm-workspace.yaml`(빌드 허용 의존성: `@biomejs/biome`, `esbuild`).
- 경로 별칭 `@/*` → `web/src/*`(`tsconfig.json` + `vite-tsconfig-paths`).

## web — 빌드 도구

- Vite 6 + `@vitejs/plugin-react`(설정 `web/vite.config.ts`). dev 서버 포트 3000.
- Vite 플러그인 체인: `@tanstack/router-plugin/vite`(파일 기반 라우트 → `web/src/routeTree.gen.ts` 자동 생성, `autoCodeSplitting: true`), `@tailwindcss/vite`, `vite-tsconfig-paths`.
- 빌드 스크립트는 `tsc -b && vite build`(`web/package.json`). 진입 HTML은 `web/index.html`(`<html lang="ko">`, Noto Sans/Serif KR 웹폰트를 Google Fonts에서 로드, 인라인 스크립트로 다크모드 prefers-color-scheme 선적용).

## web — 프레임워크·핵심 의존성

- **React 19**(`react`, `react-dom` ^19.0.0).
- **라우팅**: TanStack Router(`@tanstack/react-router` ^1.95) — 파일 기반(`web/src/routes/`), devtools는 `@tanstack/react-router-devtools`(DEV 한정, `web/src/routes/__root.tsx`).
- **서버 상태**: TanStack Query(`@tanstack/react-query` ^5.75). 단일 `QueryClient`를 `web/src/providers/app-providers.tsx`에서 생성(mutations retry: false).
- **클라이언트 상태**: Zustand ^5(`zustand`) + immer 미들웨어(`zustand/middleware/immer`, `immer` ^11). 영속화는 `zustand/middleware`의 `persist`(localStorage).
- **에디터**: tiptap v3(`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` ^3.27). 사용처는 단 한 곳 — `web/src/features/editor/components/manuscript.tsx`(`useEditor` + `StarterKit`).
- **폼**: React Hook Form ^7.55 + `@hookform/resolvers` ^4 + Zod ^3.24. 폼 devtool은 `@hookform/devtools`(DEV 한정 lazy, `web/src/components/dev/form-devtool.tsx`).
- **스타일**: Tailwind CSS v4(`tailwindcss` ^4, `@tailwindcss/vite`). 전역 CSS `web/src/styles/globals.css`(`@import "tailwindcss"` + `tw-animate-css`, CSS 변수 기반 테마, `.dark` 변형). shadcn 계열 설정 `web/components.json`(style `base-nova`, baseColor neutral, icon lucide).
- **UI 프리미티브·아이콘**: `radix-ui`/`@radix-ui/*`, `@base-ui/react`, `lucide-react`, `@radix-ui/react-icons`. 유틸: `class-variance-authority`, `clsx`, `tailwind-merge`(`web/src/lib/utils.ts`).
- **그 외 UI 라이브러리**: `cmdk`(커맨드 팔레트, `web/src/components/ui/command.tsx`), `sonner`(토스트, `web/src/components/ui/sonner.tsx` + `__root.tsx`), `motion`(애니메이션), `recharts`(차트), `@tanstack/react-table`(테이블), `react-day-picker`/`date-fns`(날짜), `react-focus-lock`, `@fontsource-variable/inter`, `@faker-js/faker`(mock 데이터 생성).
- **i18n(미사용 상태)**: `i18next` ^26·`react-i18next` ^17이 의존성에 선언돼 있으나 `web/src/` 어디서도 import되지 않는다. 현재 모든 문구는 한국어 하드코딩.

## web — 린트·포맷·테스트

- **Biome 1.9.4**(`@biomejs/biome`)가 린트+포맷 단일 도구(`web/biome.json`). 들여쓰기 space 2칸, lineWidth 100, 작은따옴표, ES5 trailing comma, organizeImports 활성. 무시 대상: `node_modules`, `dist`, `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`.
- 검증 스크립트: `pnpm typecheck`(tsc --noEmit) + `pnpm lint`(biome check). **테스트 러너 없음** — web에 vitest/jest 미설정(CLAUDE.md 명시).
- 명령은 `web/Taskfile.yml`로도 래핑(`task web:check` = typecheck + lint, 그 외 dev/build/preview/generate/clean).

## web — 생성물(직접 편집 금지)

- `web/src/routeTree.gen.ts` — TanStack Router 플러그인 산출물.
- `web/src/api/**` — `@hey-api/openapi-ts`로 OpenAPI에서 생성한 타입·SDK·Query 훅(`pnpm generate`). 설정 `web/openapi-ts.config.ts`. tsc/biome 모두 제외 대상. 상세는 INTEGRATIONS.md.

## web — 설정 파일 요약

`web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/biome.json`, `web/openapi-ts.config.ts`, `web/components.json`, `web/pnpm-workspace.yaml`, `web/.pnpm-build-policy.json`, `web/index.html`, `web/Taskfile.yml`.

## api — 언어·런타임·스택

`api/CLAUDE.md`·`api/pyproject.toml` 기준(프론트 작업 범위 밖이므로 요약만).

- Python ≥ 3.12, FastAPI(`fastapi[standard]`) + Uvicorn. 패키지 매니저 **uv**(lockfile `api/uv.lock`, 설정 `api/pyproject.toml`).
- 데이터: PostgreSQL(asyncpg) + SQLAlchemy(async) + Alembic(`api/alembic/`, `api/alembic.ini`), Redis.
- 인증: JWT(python-jose) + argon2 + OAuth(Google/Kakao/Naver) + RBAC.
- LLM: LangChain + langchain-litellm(provider는 `LLM_PROVIDER` 환경변수로 교체). 상세는 INTEGRATIONS.md.
- 품질: ruff(린트+포맷), mypy(strict), pytest. 명령은 `api/Taskfile.yml`/`api/Justfile`. pre-commit 설정 `api/.pre-commit-config.yaml`, secrets 스캔 baseline `api/.secrets.baseline`.
- 구조: src layout(PYTHONPATH=src) Light Modular Monolith(DDD). `src/core`, `src/domains/{auth,chat,shared}`, `src/infra/llm`, 진입점 `src/main.py`.
- 컨테이너: `api/Dockerfile`, `api/docker-compose.yml`(로컬), `api/docker-compose.prod.yml`(운영).
