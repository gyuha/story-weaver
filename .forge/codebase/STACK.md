---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# STACK

모노레포 = `api/`(FastAPI 백엔드) + `web/`(React 프론트엔드). 루트 `Taskfile.yml`이 두 앱을 `api:`/`web:` 네임스페이스로 오케스트레이션한다.

## 언어·런타임

| 영역 | 버전 | 근거 |
|---|---|---|
| api | Python ≥ 3.12 (`.python-version` = `3.12`) | `api/pyproject.toml` `requires-python`, `api/.python-version` |
| web | Node ≥ 22.18, pnpm ≥ 10.0 (`packageManager: pnpm@10.28.2`) | `web/package.json` `engines`/`packageManager` |
| web 언어 | TypeScript `^5.8.3`, strict 모드 | `web/tsconfig.json` (`strict: true`, `noUnusedLocals`, `noUnusedParameters`) |

## 패키지 매니저·빌드 도구

- **api**: `uv` (의존성 잠금 `api/uv.lock`, 빌드 백엔드 `hatchling`, src layout — `packages = ["src"]`).
- **web**: `pnpm` (`web/pnpm-lock.yaml`), 번들러 `vite@^6.0.0`, 빌드는 `tsc -b && vite build`.
- 태스크 러너: 루트/`api/`/`web/` 각각 `Taskfile.yml` (Taskfile.dev). 루트가 `api`/`web`을 include하여 `task api:xxx`, `task web:xxx`로 위임.

## FastAPI 백엔드 — 주요 의존성 (`api/pyproject.toml`)

| 패키지 | 용도 |
|---|---|
| `fastapi[standard]`, `uvicorn[standard]` | 웹 프레임워크·ASGI 서버 |
| `pydantic`, `pydantic-settings` | 스키마 검증, `.env` 기반 설정(`src/core/config.py`) |
| `sqlalchemy[asyncio]`, `alembic`, `asyncpg`, `psycopg2-binary`, `pgvector` | 비동기 ORM(asyncpg), 동기 드라이버(Alembic 전용, psycopg2), 마이그레이션, pgvector `Vector` 컬럼 타입 |
| `python-jose[cryptography]`, `passlib[argon2]`, `argon2-cffi` | JWT 서명/검증, argon2 비밀번호 해싱 |
| `redis[hiredis]` | JWT 블랙리스트·rate-limit·budget 카운터 (아래 INTEGRATIONS 참고) |
| `httpx` | OAuth 코드 교환 등 외부 HTTP 호출 |
| `fastapi-mail` | 이메일 발송(dev=Mailpit, prod=SMTP) |
| `structlog` | JSON 구조화 로깅(`src/core/logging.py`) |
| `slowapi` | per-user rate limiting(`src/core/rate_limit.py`) |
| `sse-starlette` | SSE 스트리밍 응답(`EventSourceResponse`) |
| `langchain`, `langchain-core`, `langchain-community`, `langchain-litellm`, `litellm` | LLM 프로바이더 추상화·라우팅 |
| `tenacity` | LLM 호출 재시도 (선언만 되어 있고 현재 코드에서 직접 사용처는 미확인) |
| `sentence-transformers` | 로컬 임베딩 모델 실행(외부 API 아님) |
| `python-multipart`, `email-validator` | FastAPI 폼/이메일 검증 |

개발 그룹(`[dependency-groups].dev`): `pytest`, `pytest-asyncio`, `pytest-cov`, `anyio`, `httpx`(테스트용 AsyncClient), `fakeredis`(Redis 스텁), `ruff`, `mypy`, `pre-commit`, `detect-secrets`.

## React 프론트엔드 — 주요 의존성 (`web/package.json`)

| 패키지 | 용도 |
|---|---|
| `react@19`, `react-dom@19` | UI 런타임 |
| `vite@6`, `@vitejs/plugin-react`, `vite-tsconfig-paths` | 개발 서버·번들러, `@/*` 경로 별칭 |
| `@tanstack/react-router`, `@tanstack/router-plugin` | 파일 기반 라우팅(빌드 시 `src/routeTree.gen.ts` 자동 생성, `autoCodeSplitting`) |
| `@tanstack/react-query` | 서버 상태 캐싱(`src/providers/app-providers.tsx`에서 `QueryClientProvider` 구성, `mutations.retry: false`) |
| `zustand`, `immer` | 클라이언트 상태(모의 스토어 포함) |
| `axios` + `@hey-api/client-axios` | 생성 SDK의 HTTP 클라이언트 |
| `@hey-api/openapi-ts`(devDep) | `docs/openapi.json` → `src/api/*` 타입·SDK·TanStack Query 훅 생성기 |
| `zod`, `react-hook-form`, `@hookform/resolvers` | 폼 스키마 검증 |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` | 리치 텍스트 에디터(집필 화면) |
| `tailwindcss@4`, `@tailwindcss/vite`, `tw-animate-css`, `tailwind-merge` | 스타일링 |
| `radix-ui`, `@radix-ui/react-*`, `@base-ui/react`, `cmdk`, `lucide-react` | 헤드리스 UI 컴포넌트·아이콘 |
| `recharts` | 차트 |
| `react-markdown` | 마크다운 렌더링 |
| `motion` | 애니메이션 |
| `sonner` | 토스트 알림 |
| `date-fns`, `react-day-picker` | 날짜 처리·달력 UI |
| `@faker-js/faker` | mock 시드 데이터 생성(`features/*/mock/`) |
| `i18next`, `react-i18next` | 의존성으로 설치돼 있으나 `web/src` 내 실제 import·초기화 코드는 확인되지 않음(미배선 상태로 보임) |

devDependencies 중 테스트: `vitest@^4.1.9`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.

## 빌드·실행 명령

**루트** (`Taskfile.yml`):
```
task dev            # api(:8000) + web(:3000) 동시 실행
task install         # api + web 의존성 일괄 설치
task build           # web 프로덕션 빌드
task check           # web typecheck + lint
task contract        # api:openapi → web:generate (OpenAPI 계약 갱신)
task contract-check  # contract 후 web:check까지 검증
```

**api** (`api/Taskfile.yml`, `cd api`):
```
task dev       # uv sync + infra(docker compose) + alembic upgrade head + uvicorn --reload (:8000)
task test      # pytest (coverage 강제, --cov-fail-under=70)
task lint      # ruff check + mypy
task format    # ruff format + ruff check --fix
task migrate   # alembic upgrade head
task openapi   # FastAPI OpenAPI 스펙을 repo-root docs/openapi.json으로 export
```
직접 실행 시 `uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload`(`PYTHONPATH=src`).

**web** (`web/package.json`, `cd web`):
```
pnpm dev         # Vite 개발 서버 (:3000)
pnpm build       # tsc -b && vite build
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check .
pnpm test        # vitest run
pnpm generate    # openapi-ts: docs/openapi.json → src/api
```

## 설정 파일·환경변수 체계

- **api 설정**: `api/src/core/config.py`의 `Settings`(pydantic-settings, `env_file=".env"`)가 단일 진입점. 하위 `LLMSettings`(`env_prefix="LLM_"`)는 `settings.llm` 프로퍼티로 파생. 값이 비어 있으면 `POSTGRES_*`/`REDIS_*` 개별 변수로부터 DSN을 조립(`async_database_url`, `sync_database_url`, `redis_dsn`).
  - 로컬: `api/.env`(커밋 금지, `api/.env.example`이 템플릿) — 변수는 앱/서버/DB/Redis/JWT/OAuth(Google·Kakao·Naver)/메일/LLM(공급자별 키)/budget/observability 섹션으로 구성.
  - 운영: `api/.env.prod`(`api/.env.prod.example`이 템플릿), `api/docker-compose.prod.yml`이 `env_file: .env.prod` + 컨테이너 내부용 `POSTGRES_HOST=postgres`/`REDIS_HOST=redis` 오버라이드를 추가 주입.
- **web 설정**: 빌드 시점 환경변수는 `VITE_API_BASE_URL` 하나 — `web/src/lib/api-client.ts`(axios baseURL)와 `web/src/features/editor/api/assist.api.ts`(raw fetch SSE 경로)에서 각각 읽는다. dev 프록시는 `web/vite.config.ts`(`/api` → `http://localhost:8000`, rewrite 없음).
- **OpenAPI 계약**: `web/openapi-ts.config.ts` — 입력 `../docs/openapi.json`, 출력 `web/src/api`, 플러그인 `@hey-api/client-axios`(런타임 설정은 `web/src/lib/api-client.ts`) + `@hey-api/typescript` + `@hey-api/sdk` + `@tanstack/react-query`.
- **경로 별칭**: `web/tsconfig.json` `paths: {"@/*": ["./src/*"]}`, `vite-tsconfig-paths` 플러그인이 Vite/Vitest에도 동일 별칭 적용.
- **테스트 설정**: `web/vitest.config.ts`(jsdom 환경, `src/test/setup.ts`), `api/pyproject.toml` `[tool.pytest.ini_options]`(asyncio_mode=auto, 마커 unit/integration/e2e, coverage 70% 강제).

## 린트·타입체크·포맷

| 영역 | 도구 | 설정 위치 |
|---|---|---|
| api 린트 | `ruff check`(E/W/F/I/N/UP/B/C4/SIM/ANN/S/T20/PT/RUF 룰셋) | `api/pyproject.toml` `[tool.ruff]` |
| api 포맷 | `ruff format`(double quote, LF) | `api/pyproject.toml` `[tool.ruff.format]` |
| api 타입체크 | `mypy --strict`(플러그인 `pydantic.mypy`, `sqlalchemy.ext.mypy.plugin`) | `api/pyproject.toml` `[tool.mypy]` |
| api 커밋 훅 | `pre-commit`(ruff+mypy+detect-secrets 등) | `api/.pre-commit-config.yaml`, `api/.secrets.baseline` |
| web 린트·포맷 | Biome(`biome check`/`check --write`) — 들여쓰기 2칸, 작은따옴표, 줄 폭 100, ES5 trailing comma. `src/routeTree.gen.ts`·`src/api`·`docs/openapi.json` 제외 | `web/biome.json` |
| web 타입체크 | `tsc --noEmit`(strict) | `web/tsconfig.json` |
| web 테스트 | `vitest run` + React Testing Library | `web/vitest.config.ts` |

## 생성 파일 (직접 수정 금지)

- `web/src/routeTree.gen.ts` — `@tanstack/router-plugin`이 `web/src/routes/`에서 빌드 시 생성.
- `web/src/api/**` — `pnpm generate`(`openapi-ts`)가 `docs/openapi.json`에서 생성.
