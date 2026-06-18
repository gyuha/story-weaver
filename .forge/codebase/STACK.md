---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# STACK

StoryWeaver는 두 개의 독립 디렉터리로 구성된다. `api/`는 Python FastAPI 백엔드(uv + src layout), `web/`는 React 19 + Vite 프론트엔드(pnpm)다. 루트에는 워크스페이스 매니페스트가 없고 각 디렉터리가 자기 완결적이다.

---

## api — Python FastAPI 백엔드

근거 파일: `api/pyproject.toml`, `api/uv.lock`, `api/alembic.ini`, `api/docker-compose.yml`, `api/Taskfile.yml`, `api/Justfile`, `api/.pre-commit-config.yaml`

### 언어 · 런타임

- Python `>=3.12` (`api/pyproject.toml` `requires-python`, `target-version = "py312"`, `tool.mypy.python_version = "3.12"`).
- 패키지 매니저: **uv**. 의존성 그룹은 PEP 735 `[dependency-groups]`로 정의하며 `tool.uv.default-groups = ["dev"]`로 `dev` 그룹이 `uv sync` 기본 포함.
- 빌드 백엔드: **hatchling** (`[build-system]`), wheel 패키지는 `src` (`tool.hatch.build.targets.wheel.packages = ["src"]`).
- 패키지명 `story-weaver-api`, 버전 `0.1.0`, 라이선스 MIT.

### 웹 프레임워크 · 서버

- **FastAPI** `>=0.115.0` (`fastapi[standard]`).
- **Uvicorn** `>=0.30.0` (`uvicorn[standard]`) — ASGI 서버. 진입점 `src/main.py`의 `app` 객체, 직접 실행은 `python -m app` (`src/__main__.py`).
- `python-multipart>=0.0.12` — 폼/파일 업로드.

### 검증 · 설정

- **Pydantic** `>=2.9.0`, **pydantic-settings** `>=2.5.0` (`src/core/config.py`의 `Settings`/`LLMSettings`가 환경변수 로드).
- `email-validator>=2.2.0` — Pydantic `EmailStr` 활성화.

### 데이터베이스 · 마이그레이션

- **SQLAlchemy** `>=2.0.36` (`sqlalchemy[asyncio]`) — async ORM. `src/core/database.py`가 `create_async_engine`로 엔진/세션팩토리/`DeclarativeBase` 정의(pool_size 5, max_overflow 10, pool_pre_ping, pool_recycle 3600).
- **asyncpg** `>=0.30.0` — async 드라이버(`postgresql+asyncpg://`).
- **psycopg2-binary** `>=2.9.9` — sync 드라이버(`postgresql+psycopg2://`), Alembic 마이그레이션용.
- **Alembic** `>=1.14.0` — 설정 `api/alembic.ini`(script_location `alembic`, `prepend_sys_path = . src`, timezone UTC). `sqlalchemy.url`은 비워두고 런타임에 `DATABASE_URL_SYNC` 환경변수로 읽음(`api/alembic/env.py`). 마이그레이션 디렉터리 `api/alembic/versions/`(현재 `0001_initial_schema.py` 하나).

### 인증 · 보안

- **python-jose[cryptography]** `>=3.3.0` — JWT 인코딩/디코딩.
- **passlib[argon2]** `>=1.7.4` + **argon2-cffi** `>=23.1.0` — 패스워드 해싱(argon2 백엔드).
- 보안 코드는 `src/domains/auth/security.py`.

### 캐시 · 스트리밍 · 비동기

- **redis[hiredis]** `>=5.2.0` — `src/core/redis.py`가 `redis.asyncio` 단일 클라이언트(decode_responses=True, max_connections=20).
- **sse-starlette** `>=2.1.0` — LLM 토큰 SSE 스트리밍(`EventSourceResponse`, `src/domains/chat/router/chat_router.py`).
- **slowapi** `>=0.1.9` — Redis 기반 레이트리밋. `src/main.py`에서 `Limiter`를 사용자 ID 또는 IP 키로 구성.
- **httpx** `>=0.27.0` — OAuth 토큰 교환용 HTTP 클라이언트(`src/domains/auth/oauth/*.py`).
- **fastapi-mail** `>=1.4.2` — SMTP 메일 발송(`src/domains/auth/email.py`).
- **structlog** `>=24.4.0` — JSON 구조화 로깅 + correlation_id(`src/core/logging.py`, `src/core/middleware.py`).
- **tenacity** `>=8.5.0` — LLM 일시 오류 재시도.

### LLM 스택

- **langchain** `>=0.3.0`, **langchain-core** `>=0.3.0`, **langchain-community** `>=0.3.0`.
- **langchain-litellm** `>=0.2.0` — `ChatLiteLLM` 어댑터. 생성 단일 지점 `src/infra/llm/provider_factory.py`.
- **litellm** `>=1.50.0` — provider 라우팅(openai/anthropic/gemini/azure/ollama). 모델 문자열 팩토리 `src/domains/chat/llm_factory.py`.

### 품질 · 테스트 도구 (`dev` 그룹)

- **ruff** `>=0.8.0` — 린터 + 포매터. `line-length = 100`, double quote, lint select `E,W,F,I,N,UP,B,C4,SIM,ANN,S,T20,PT,RUF`, per-file-ignores로 tests/alembic/scripts 완화(`tool.ruff`).
- **mypy** `>=1.13.0` — `strict = true`, plugins `pydantic.mypy`, `sqlalchemy.ext.mypy.plugin`. LLM/redis/jose 등은 `ignore_missing_imports` (`tool.mypy.overrides`).
- **pytest** `>=8.3.0` + **pytest-asyncio** `>=0.24.0`(`asyncio_mode = "auto"`) + **pytest-cov** `>=5.0.0`. `pythonpath = ["src"]`, 커버리지 게이트 `--cov-fail-under=70`, 마커 `unit/integration/e2e`. **anyio** `>=4.6.0`, **fakeredis** `>=2.26.0`(인메모리 Redis 스텁).
- **pre-commit** `>=4.0.0` + **detect-secrets** `>=1.5.0`(시크릿 스캔, baseline `api/.secrets.baseline`). 설정 `api/.pre-commit-config.yaml`.
- 타입 스텁: `sqlalchemy[mypy]`, `types-passlib`, `types-python-jose`.
- 커버리지 설정 `tool.coverage`(branch=true, migrations/alembic/tests omit).

### 태스크 러너 · 설정 파일

- **Taskfile** (`api/Taskfile.yml`) 및 **Justfile** (`api/Justfile`) — `task dev/test/lint/format/migrate` 명령(`api/CLAUDE.md` 참조).
- 환경설정: `api/.env`(로컬), `api/.env.example`, `api/.env.prod.example`.
- 컨테이너: `api/Dockerfile`, `api/docker-compose.yml`(로컬 인프라), `api/docker-compose.prod.yml`(운영 overlay + app 서비스).

### 구조 (src layout / Light Modular Monolith)

`src/`가 PYTHONPATH 루트. `src/core/`(횡단), `src/domains/<bc>/`(auth, chat, shared — router/service/repository/models/schemas), `src/infra/`(외부 어댑터). 상세는 `api/CLAUDE.md`.

---

## web — React + Vite 프론트엔드

근거 파일: `web/package.json`, `web/pnpm-lock.yaml`, `web/pnpm-workspace.yaml`, `web/vite.config.ts`, `web/tsconfig.json`, `web/biome.json`, `web/components.json`, `web/openapi-ts.config.ts`

### 언어 · 런타임 · 패키지 매니저

- **TypeScript** `^5.8.3`, `strict: true`, target `ES2022`, module `ESNext`, `moduleResolution: "Bundler"`, JSX `react-jsx`, path alias `@/* → ./src/*`(`web/tsconfig.json`). `src/api` 디렉터리는 타입체크 제외.
- **Node** `>=22.18.0`, **pnpm** `>=10.0.0`, `packageManager: pnpm@10.28.2`(`web/package.json` engines).
- pnpm 빌드 정책: `web/.pnpm-build-policy.json` + `pnpm-workspace.yaml`(`onlyBuiltDependencies: @biomejs/biome, esbuild`).
- 패키지명 `story-weaver-web`, `private: true`, `type: module`, 버전 `0.1.0`.

### 빌드 도구 (Vite)

- **Vite** `^6.0.0` (`web/vite.config.ts`). 플러그인:
  - `@vitejs/plugin-react` `^4.3.4`
  - `@tanstack/router-plugin` `^1.95.0` — `tanstackRouter`(routesDirectory `src/routes`, generatedRouteTree `src/routeTree.gen.ts`, autoCodeSplitting).
  - `@tailwindcss/vite` `^4.0.0`
  - `vite-tsconfig-paths` `^5.1.4`
- dev 서버 포트 `3000`, `/api` → `http://localhost:8080` 프록시(rewrite로 `/api` 프리픽스 제거).
- 빌드: `tsc -b && vite build`(`build` 스크립트).

### UI 프레임워크 · 라우팅 · 상태

- **React** `^19.0.0` + **react-dom** `^19.0.0` (`@types/react`/`@types/react-dom` `^19.1.x`).
- **@tanstack/react-router** `^1.95.0`(라우터 인스턴스 `src/lib/router.ts`, 라우트 `src/routes/`) + **@tanstack/react-router-devtools** `^1.166.13`.
- **@tanstack/react-query** `^5.75.0` — `QueryClientProvider`(`src/providers/app-providers.tsx`, mutations retry=false).
- **@tanstack/react-table** `^8.21.3`.
- **zustand** `^5.0.3`(상태 스토어 `src/stores`, `src/features/*/store`) + **immer** `^11.1.4`.

### 스타일 · 컴포넌트

- **Tailwind CSS** `^4.0.0` + **tw-animate-css** `^1.4.0`. CSS 진입점 `src/styles/globals.css`.
- **shadcn** (`web/components.json`) — style `base-nova`, baseColor `neutral`, cssVariables, alias `@/components`, `@/lib/utils`, `@/components/ui`. RSC 미사용.
- Radix/Base UI 프리미티브: `radix-ui` `^1.4.3`, `@radix-ui/react-icons`/`react-label`/`react-slot`, `@base-ui/react` `^1.4.1`.
- 유틸: `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^2.6.0`(`@/lib/utils`).
- 아이콘: **lucide-react** `^0.487.0`(`iconLibrary: lucide`).
- 폰트: `@fontsource-variable/inter` `^5.1.1`.
- 기타 UI: `cmdk` `^1.1.1`, `sonner` `^2.0.3`(토스트), `motion` `^11.18.0`, `recharts` `^3.8.1`(차트), `react-day-picker` `^10.0.0`, `react-focus-lock` `^2.13.7`.

### 폼 · 검증 · 날짜 · i18n

- **react-hook-form** `^7.55.0` + **@hookform/resolvers** `^4.1.3` + **@hookform/devtools** `^4.4.0`(dev).
- **zod** `^3.24.2` — 스키마 검증(`src/features/*/schema`).
- **date-fns** `^4.1.0`.
- **i18next** `^26.0.10` + **react-i18next** `^17.0.7`(로케일 `src/sample/i18n/locales/{ko,en}`).
- **@faker-js/faker** `^10.4.0` — mock 데이터.

### HTTP 클라이언트 · API 코드 생성

- **axios** `^1.16.1` — HTTP 클라이언트. 클라이언트 설정 `src/lib/api-client.ts`(baseURL = `VITE_API_BASE_URL ?? '/api'`), 인터셉터 `src/lib/api-interceptors.ts`.
- **@hey-api/openapi-ts** `0.98.1`(dev) — OpenAPI → TS 클라이언트 생성. 설정 `web/openapi-ts.config.ts`(input `./docs/openapi.json`, output `./src/api`, 플러그인 `@hey-api/client-axios`, `@hey-api/typescript`, `@hey-api/sdk`, `@tanstack/react-query`). 생성 산출물 `src/api/`(`client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`, `@tanstack/`). 스크립트 `generate`.

### 품질 도구

- **@biomejs/biome** `^1.9.4` — 린트 + 포맷(`web/biome.json`). indentWidth 2, lineWidth 100, single quote, trailingCommas es5, organizeImports. `src/routeTree.gen.ts`/`src/api`/`docs/openapi.json` 무시. 스크립트 `lint`/`lint:fix`/`format`.
- TS 검사: `typecheck`(`tsc --noEmit`).
- `@types/node` `^22.14.1`(dev).
