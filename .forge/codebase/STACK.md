---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-26
---

# 기술 스택 (STACK)

StoryWeaver는 monorepo로, `web/`(React 프론트엔드)와 `api/`(FastAPI 백엔드)가 한 저장소에 공존한다. 루트에 `Taskfile.yml`(go-task), `.gitignore`, `README.md`가 있고 도메인 문서는 `docs/`, 결정·용어집은 `.forge/`에 있다.

---

## web — 프론트엔드

### 런타임·언어

- **Node.js** `>=22.18.0`, **pnpm** `>=10.0.0` (`packageManager: pnpm@10.28.2`) — `web/package.json` `engines`/`packageManager`.
- **TypeScript** `^5.8.3`, strict 모드. `web/tsconfig.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `moduleResolution: "Bundler"`, `target: ES2022`, `jsx: react-jsx`). 경로 별칭 `@/*` → `./src/*`. `src/api`는 `exclude` 대상.
- 추가 tsconfig: `web/tsconfig.node.json` (Vite 설정 파일용 project reference).

### 프레임워크·핵심 라이브러리 (`web/package.json` dependencies)

- **React 19** — `react`/`react-dom` `^19.0.0`.
- **TanStack Router** `@tanstack/react-router` `^1.95.0` — 파일 기반 라우팅. 빌드 시 `src/routeTree.gen.ts` 자동 생성 (생성물).
- **TanStack Query** `@tanstack/react-query` `^5.75.0` — 서버 상태.
- **TanStack Table** `@tanstack/react-table` `^8.21.3`.
- **Zustand** `^5.0.3` + **immer** `^11.1.4` — 클라이언트 상태. 스토어 예: `web/src/features/shared/store/works.store.ts`, `web/src/features/auth/store/auth.store.ts`, `web/src/stores/modal-store.ts`.
- **Tailwind CSS v4** `^4.0.0` — Vite 플러그인 `@tailwindcss/vite` `^4.0.0`로 통합. 보조: `tailwind-merge` `^2.6.0`, `tw-animate-css` `^1.4.0`, `clsx` `^2.1.1`, `class-variance-authority` `^0.7.1`.
- **UI 컴포넌트 기반** — `@base-ui/react` `^1.4.1`, `radix-ui` `^1.4.3` + 개별 `@radix-ui/react-label`·`@radix-ui/react-slot`·`@radix-ui/react-icons`, `lucide-react` `^0.487.0`(아이콘), `cmdk` `^1.1.1`(커맨드 팔레트), `sonner` `^2.0.3`(토스트), `react-focus-lock` `^2.13.7`. 컴포넌트 스캐폴딩 설정 `web/components.json` (shadcn 스타일).
- **emoji-picker-react** `^4.19.1` — 이모지 선택기 (신규 의존성, present).
- **에디터** — Tiptap `@tiptap/react`·`@tiptap/pm`·`@tiptap/starter-kit` 모두 `^3.27.1`. 집필 화면(`web/src/features/editor/`)의 본문 편집기.
- **폼·검증** — `react-hook-form` `^7.55.0`, `@hookform/resolvers` `^4.1.3`, `zod` `^3.24.2`. 개발용 `@hookform/devtools`(devDependency), 게이트 컴포넌트 `web/src/components/dev/form-devtool.tsx`.
- **HTTP** — `axios` `^1.16.1` (생성 SDK의 클라이언트).
- **i18n** — `i18next` `^26.0.10`, `react-i18next` `^17.0.7`.
- **차트·날짜** — `recharts` `^3.8.1`, `date-fns` `^4.1.0`, `react-day-picker` `^10.0.0`.
- **애니메이션** — `motion` `^11.18.0`.
- **목 데이터** — `@faker-js/faker` `^10.4.0` (현재 UI 우선 단계에서 시드 데이터 생성).
- **폰트** — `@fontsource-variable/inter` `^5.1.1`.

### 빌드·개발 도구

- **Vite 6** `^6.0.0` — `web/vite.config.ts`. 플러그인: `@tanstack/router-plugin/vite`(autoCodeSplitting, `routesDirectory: src/routes`, `generatedRouteTree: src/routeTree.gen.ts`), `@vitejs/plugin-react` `^4.3.4`, `@tailwindcss/vite`, `vite-tsconfig-paths` `^5.1.4`. dev 서버 포트 **3000**.
- **openapi-ts** `@hey-api/openapi-ts` `0.98.1` — `web/openapi-ts.config.ts`. OpenAPI 스펙 → `web/src/api/` 타입·SDK·Query 훅 코드 생성 (상세는 INTEGRATIONS.md).
- **Biome** `@biomejs/biome` `^1.9.4` — 린트+포맷. `web/biome.json`: 들여쓰기 2칸, 작은따옴표, 줄 폭 100, ES5 trailing comma, `organizeImports` 활성. ignore: `node_modules`, `dist`, `.superpowers`, `.claude`, `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`.
- **엔트리 HTML** — `web/index.html` (`#root`, `src/main.tsx` 모듈 진입).

### web 스크립트 (`web/package.json` scripts)

- `dev` = `vite`
- `build` = `tsc -b && vite build`
- `typecheck` = `tsc --noEmit`
- `lint` = `biome check .` / `lint:fix` = `biome check --write .` / `format` = `biome format --write .`
- `generate` = `openapi-ts`
- `preview` = `vite preview`

테스트 러너는 web에 미설정 (vitest/jest 없음). 검증은 `typecheck` + `lint`.

### web 소스 구조

`web/src/` 하위: `routes/`(파일 기반 라우트, `__root.tsx`·`index.tsx`·`auth/`·`works/`·`settings/`), `features/`(`auth · editor · landing · memory · settings · shared · timeline · works · world-bible` — 각 도메인이 `components / store / types / schema / lib / mock`로 자기완결), `components/`(`ui · layout · dev`), `lib/`(`api-client.ts · api-interceptors.ts · router.ts · utils.ts`), `providers/`, `hooks/`, `stores/`, `styles/`, `api/`(생성물). 설계 문서 `web/DESIGN.md`·`web/PRD.md`.

---

## api — 백엔드

### 런타임·언어

- **Python** `>=3.12` (`requires-python`, ruff/mypy `target py312`) — `api/pyproject.toml`.
- **패키지 매니저: uv** — `api/uv.lock`, `[tool.uv] default-groups = ["dev"]`, `[dependency-groups]`(PEP 735). 빌드 백엔드 **hatchling**, src layout (`[tool.hatch.build.targets.wheel] packages = ["src"]`). `PYTHONPATH=src`.

### 프레임워크·핵심 의존성 (`api/pyproject.toml` dependencies)

- **웹 프레임워크** — `fastapi[standard]` `>=0.115.0`, `uvicorn[standard]` `>=0.30.0`, `python-multipart` `>=0.0.12`. 앱 팩토리 `api/src/main.py`, 엔트리 `api/src/__main__.py`.
- **검증·설정** — `pydantic` `>=2.9.0`, `pydantic-settings` `>=2.5.0`, `email-validator` `>=2.2.0`. 설정 단일 출처 `api/src/core/config.py`.
- **데이터베이스** — `sqlalchemy[asyncio]` `>=2.0.36`, `alembic` `>=1.14.0`, `asyncpg` `>=0.30.0`(async 드라이버), `psycopg2-binary` `>=2.9.9`(Alembic 동기 마이그레이션용). DB 모듈 `api/src/core/database.py`, 마이그레이션 `api/alembic/`(`env.py`·`versions/`·`alembic.ini`).
- **인증·보안** — `python-jose[cryptography]` `>=3.3.0`(JWT), `passlib[argon2]` `>=1.7.4` + `argon2-cffi` `>=23.1.0`(비밀번호 해싱). 도메인 `api/src/domains/auth/`.
- **캐시·Pub/Sub** — `redis[hiredis]` `>=5.2.0` (JWT 블랙리스트, rate-limit, OAuth state, SSE fanout). 모듈 `api/src/core/redis.py`.
- **HTTP 클라이언트** — `httpx` `>=0.27.0` (OAuth 플로우 등).
- **이메일** — `fastapi-mail` `>=1.4.2` (dev=mailpit, prod=SMTP).
- **관측성** — `structlog` `>=24.4.0` (JSON 구조화 로깅 + correlation_id). 미들웨어 `api/src/core/middleware.py`, 로깅 `api/src/core/logging.py`.
- **레이트 리미팅** — `slowapi` `>=0.1.9` (Redis 기반).
- **스트리밍·LLM** — `sse-starlette` `>=2.1.0`(SSE), `langchain`·`langchain-core`·`langchain-community` `>=0.3.0`, `langchain-litellm` `>=0.2.0`, `litellm` `>=1.50.0`(프로바이더 라우팅), `tenacity` `>=8.5.0`(재시도). LLM 어댑터 `api/src/infra/llm/provider_factory.py`, 채팅 도메인 `api/src/domains/chat/`. (상세는 INTEGRATIONS.md)

### 개발·품질 도구 (`[dependency-groups] dev`)

- **pytest** `>=8.3.0` + `pytest-asyncio` `>=0.24.0` + `pytest-cov` `>=5.0.0` + `anyio` `>=4.6.0`, `httpx`(테스트 클라이언트), `fakeredis` `>=2.26.0`. pytest 설정 `[tool.pytest.ini_options]`: `asyncio_mode=auto`, `testpaths=["tests"]`, 커버리지 `--cov-fail-under=70`, 마커 `unit/integration/e2e`. 테스트 `api/tests/`.
- **ruff** `>=0.8.0` — 린트+포맷. `[tool.ruff]` line-length 100, py312, 다수 규칙군(E/W/F/I/N/UP/B/C4/SIM/ANN/S/T20/PT/RUF), format quote-style double.
- **mypy** `>=1.13.0` — `[tool.mypy] strict=true`, 플러그인 `pydantic.mypy`·`sqlalchemy.ext.mypy.plugin`.
- **pre-commit** `>=4.0.0` + `detect-secrets` `>=1.5.0` — `api/.pre-commit-config.yaml`, `api/.secrets.baseline`.
- 타입 스텁: `types-passlib`, `types-python-jose`, `sqlalchemy[mypy]`.

### api 빌드·배포·태스크 파일

- **태스크 러너** — `api/Taskfile.yml`(go-task), `api/Justfile`(just). 주요: `task dev`(uv sync + infra + migrate + uvicorn), `task test`, `task lint`(ruff + mypy), `task format`, `task migrate`.
- **컨테이너** — `api/Dockerfile`, `api/docker-compose.yml`(dev), `api/docker-compose.prod.yml`(prod), `api/.dockerignore`.
- **환경** — `api/.env`(로컬, 커밋됨/주의), `api/.env.example`, `api/.env.prod.example`. 설정 키 상세는 INTEGRATIONS.md.

### api 소스 구조 — Light Modular Monolith (DDD)

`api/src/`: `core/`(횡단 — `config · database · redis · middleware · exceptions · logging`), `domains/`(`auth`·`chat`·`shared`; 각 도메인 `router / service / repository / models / schemas`), `infra/`(외부 어댑터 — `llm/provider_factory.py`). 도메인 간 직접 DB 모델 import 금지(`api/CLAUDE.md`).

---

## 설정 파일 요약 (경로)

| 영역 | 파일 |
|------|------|
| web 패키지·스크립트 | `web/package.json`, `web/pnpm-lock.yaml`, `web/pnpm-workspace.yaml`, `web/.pnpm-build-policy.json` |
| web TypeScript | `web/tsconfig.json`, `web/tsconfig.node.json` |
| web 번들러 | `web/vite.config.ts` |
| web 코드젠 | `web/openapi-ts.config.ts` |
| web 린트·포맷 | `web/biome.json` |
| web UI 스캐폴딩 | `web/components.json` |
| web 태스크 | `web/Taskfile.yml` |
| api 프로젝트·도구 | `api/pyproject.toml`, `api/uv.lock` |
| api 마이그레이션 | `api/alembic.ini`, `api/alembic/env.py` |
| api 태스크 | `api/Taskfile.yml`, `api/Justfile` |
| api 컨테이너 | `api/Dockerfile`, `api/docker-compose.yml`, `api/docker-compose.prod.yml` |
| api 환경 | `api/.env.example`, `api/.env.prod.example` |
| api pre-commit | `api/.pre-commit-config.yaml`, `api/.secrets.baseline` |
| 루트 태스크 | `Taskfile.yml` |
