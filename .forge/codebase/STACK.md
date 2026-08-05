---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# STACK

모노레포 = `api/`(FastAPI 백엔드) + `web/`(React 프론트엔드) + `docs/`(설계 문서 6종 + OpenAPI 계약 파일). 루트 `Taskfile.yml`이 `api/Taskfile.yml`·`web/Taskfile.yml`을 `api:`/`web:` 네임스페이스로 include해 한 곳에서 오케스트레이션한다.

## 규모 (이번 매핑 시점 실측)

| 영역 | 파일 | 줄 |
|---|---|---|
| `api/src` | 161 | 13,974 |
| `api/tests` (그중 `test_*.py` 83개) | 110 | 20,653 |
| `api/alembic` | 3 | 837 |
| `api/scripts` | 5 | 1,388 |
| `web/src` 수작성 TS/TSX (`.tsx` 140 + `.ts` 69) | 209 | 20,642 |
| `web/src` 생성물 (`src/api` 17개 + `routeTree.gen.ts`) | 18 | 8,250 |

api 바운디드 컨텍스트 15개(`api/src/domains/*`: assist·auth·budget·chat·conflicts·dynamic_update·image_generation·manuscript·memory·moderation·relationships·shared·timeline·works·worldbible), web 기능 모듈 11개(`web/src/features/*`), 파일 기반 라우트 모듈 26개 + 라우트 테스트 6개(`web/src/routes/`), web 테스트 파일 48개(`__tests__/`), UI 프리미티브 31개(`web/src/components/ui/`).

## 언어·런타임

| 영역 | 버전 | 근거 |
|---|---|---|
| api | Python ≥ 3.12 | `api/pyproject.toml` `requires-python`, `api/.python-version`, ruff `target-version = "py312"`, mypy `python_version = "3.12"` |
| web 런타임 | Node ≥ 22.18.0, pnpm ≥ 10.0 (`packageManager: pnpm@10.28.2`) | `web/package.json` `engines`/`packageManager` |
| web 언어 | TypeScript `^5.8.3` strict | `web/tsconfig.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, target ES2022, `moduleResolution: Bundler`) |

## 패키지 매니저·빌드·태스크 러너

- **api**: `uv` (잠금 `api/uv.lock`, 빌드 백엔드 `hatchling`, src layout `packages = ["src"]`, `PYTHONPATH=src`). `[tool.uv] default-groups = ["dev"]`이라 `uv sync`가 dev 그룹까지 항상 설치.
- **web**: `pnpm` (`web/pnpm-lock.yaml`, `web/pnpm-workspace.yaml`의 `onlyBuiltDependencies`로 `@biomejs/biome`·`esbuild`만 빌드 허용). 번들러 `vite@^6`, 프로덕션 빌드는 `tsc -b && vite build`.
- **태스크 러너**: Taskfile.dev(루트·`api/`·`web/` 3개 파일). `api/`에는 동일 태스크의 `Justfile` 사본도 함께 존재한다(둘 다 유지 — Taskfile이 루트에서 include되는 정본).

## api 의존성 (`api/pyproject.toml` — 실제 사용 위치 확인)

| 패키지 | 용도 | 사용처 |
|---|---|---|
| `fastapi[standard]`, `uvicorn[standard]` | 웹 프레임워크·ASGI 서버 | `api/src/main.py` |
| `pydantic`, `pydantic-settings` | 스키마 검증, `.env` 기반 설정 | `api/src/core/config.py` |
| `sqlalchemy[asyncio]`, `asyncpg` | 비동기 ORM·드라이버 | `api/src/core/database.py` |
| `alembic`, `psycopg2-binary` | 마이그레이션(동기 DSN 전용) | `api/alembic/env.py` |
| `pgvector` | `Vector` 컬럼 타입 | `api/src/domains/memory/models/memory_models.py`, `api/alembic/versions/0001_initial_schema.py` |
| `python-jose[cryptography]` | JWT 서명·검증 | `api/src/domains/auth/security.py` |
| `passlib[argon2]`, `argon2-cffi` | argon2 비밀번호 해싱 | 같은 파일의 `CryptContext(schemes=["argon2"])` |
| `redis[hiredis]` | 4개 키 네임스페이스(INTEGRATIONS 참고) | `api/src/core/redis.py` + 4개 소비자 |
| `httpx` | OAuth 3사 엔드포인트 직접 호출 | `api/src/domains/auth/oauth/{google,kakao,naver}.py` |
| `fastapi-mail` | 메일 발송 | `api/src/domains/auth/email.py`, `api/src/core/config.py` |
| `structlog` | 구조화 로깅 | 22개 파일 |
| `slowapi` | per-user rate limit | `api/src/core/rate_limit.py` + 라우터 6개 |
| `sse-starlette` | SSE 스트리밍 응답 | chat·assist·manuscript 라우터 |
| `anyio` | `CancelScope(shield=True)` — 스트림 취소 시 예산 차감 보장 | chat·assist·manuscript 라우터 3곳 |
| `langchain-litellm` | `ChatLiteLLM` 어댑터 | `api/src/infra/llm/provider_factory.py`(유일한 생성 지점) |
| `litellm` | 프로바이더 라우팅 + 예외 타입 | 예외만 직접 import: `api/src/domains/moderation/service/moderation_service.py` |
| `langchain-core` | `BaseMessage`/`AIMessage`/`convert_to_openai_messages` | 13개 파일 |
| `sentence-transformers` | 로컬 임베딩 모델 실행 | `api/src/domains/memory/embedding_client.py` |
| `python-multipart`, `email-validator` | FastAPI 폼 처리·`EmailStr` 활성화 | 간접(프레임워크 요구) |

**선언됐지만 `api/src`에서 import되지 않는 것**: `langchain`(메타 패키지), `langchain-community`, `tenacity`(재시도는 tenacity 없이 도메인 코드가 직접 처리). 제거 후보다.

dev 그룹(`[dependency-groups].dev`): `pytest`·`pytest-asyncio`·`pytest-cov`, `httpx`(AsyncClient), `fakeredis`, `ruff`, `mypy`, `pre-commit`, `detect-secrets`, 타입 스텁 3종(`sqlalchemy[mypy]`·`types-passlib`·`types-python-jose`).

## web 의존성 (`web/package.json` — 실제 import 확인)

| 패키지 | 용도 | 확인 |
|---|---|---|
| `react@19`, `react-dom@19` | UI 런타임 | — |
| `vite@6`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@tailwindcss/vite` | 개발 서버·번들러·별칭·CSS 파이프라인 | `web/vite.config.ts` |
| `@tanstack/react-router` + `@tanstack/router-plugin` | 파일 기반 라우팅(`autoCodeSplitting`) | 같은 파일의 `tanstackRouter()` |
| `@tanstack/react-query` | 서버 상태(`mutations.retry: false`) | `web/src/providers/app-providers.tsx` |
| `zustand`(+`persist`), `immer` | 클라이언트 상태 | 스토어 5개(`features/*/store/`, `src/stores/`) |
| `axios` + `@hey-api/client-axios` | 생성 SDK의 HTTP 클라이언트 | `web/src/lib/api-client.ts` |
| `@hey-api/openapi-ts`(dev) | `docs/openapi.json` → `src/api` 생성기 | `web/openapi-ts.config.ts` |
| `@base-ui/react` | 주 UI 프리미티브 | 17개 파일 |
| `radix-ui`(umbrella) | `Slot`·`Label` 두 프리미티브만 | `web/src/components/ui/form.tsx` 1곳 |
| `lucide-react` | 아이콘 | 43개 파일 |
| `sonner` | 토스트 | 22개 파일 |
| `tailwindcss@4`, `tw-animate-css`, `tailwind-merge`, `class-variance-authority`, `clsx` | 스타일링(진입점 `web/src/styles/globals.css`의 `@import "tailwindcss"`) | — |
| `@tiptap/react`·`starter-kit`·`pm` | 리치 텍스트 에디터 | 5개 파일 |
| `react-hook-form`, `@hookform/resolvers`, `zod` | 폼·스키마 검증 | 폼 3곳 / zod 4곳 |
| `@hookform/devtools`(dev) | DEV 전용 지연 로드 | `web/src/components/dev/form-devtool.tsx` |
| `cmdk` | 커맨드 팔레트 | 3개 파일 |
| `motion` | 애니메이션 | 3개 파일 |
| `react-markdown` / `emoji-picker-react` / `react-day-picker` | 각 1곳 | — |
| `@biomejs/biome`(dev) | 린트·포맷 | `web/biome.json` |
| `vitest@^4`, `@testing-library/{react,jest-dom,user-event}`, `jsdom`(dev) | 테스트 | `web/vitest.config.ts`, `web/src/test/setup.ts` |

**선언됐지만 `web/src`에서 import되지 않는 것**: `i18next`·`react-i18next`(0곳 — 국제화 미배선), `recharts`, `@tanstack/react-table`, `date-fns`, `react-focus-lock`, `@fontsource-variable/inter`, `@faker-js/faker`(과거 mock 시드 생성용, 현재 mock은 정적 리터럴 2파일뿐). 전부 제거 후보다.

`web/components.json`은 shadcn CLI 설정(`style: "base-nova"`, `iconLibrary: lucide`, CSS 변수 방식) — 프리미티브를 Base UI 계열로 뽑아 쓴다는 뜻이다.

## 명령어

**루트**(`Taskfile.yml`):
```
task dev             # api(:8000) + web(:3000) 동시 실행
task dev-api / dev-web
task install         # api + web 의존성 일괄 설치
task build           # web 프로덕션 빌드
task check           # web typecheck + lint
task contract        # api:openapi → web:generate (OpenAPI 계약 갱신)
task contract-check  # contract 후 web:check까지 검증
```

**api**(`cd api`): `task dev`(install+migrate 의존 → `uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir src`) · `serve`(인프라/마이그레이션 생략) · `test`/`test-unit`/`test-integration`/`test-fast`/`test-cov` · `lint`(ruff check + mypy) · `format` · `typecheck` · `openapi` · `migrate`/`revision`/`downgrade`/`migration-history`/`migration-current` · `infra`/`infra-health`/`infra-down`/`infra-logs`(`scripts/wait_for_services.sh`로 헬시 대기) · `smoke-test`(±`--skip-chat`/`--skip-email-verify`) · 운영자 CLI `verify-email`/`grant-admin`/`reset-password`(`scripts/manage.py`) · `prod-up`/`prod-down`/`prod-logs`/`prod-build`/`prod-migrate`/`prod-health` · `secrets-baseline` · `clean`/`clean-docker`.

**web**(`cd web`): `pnpm dev`(:3000) · `build`(`tsc -b && vite build`) · `preview` · `typecheck`(`tsc --noEmit`) · `lint`(`biome check .`) · `lint:fix` · `format` · `test`(`vitest run`) · `generate`(`openapi-ts`).

**OpenAPI 계약 파이프라인** — 백엔드 스키마가 단일 출처인 code-first 방식이다(`api/scripts/export_openapi.py`가 DB·Redis 연결 없이 `app.openapi()`만 덤프). 현재 스펙은 OpenAPI 3.1.0, path 53개·operation 71개·schema 72개·tag 12개, 보안 스킴은 `HTTPBearer` 하나다.

```
api FastAPI 라우터 → task api:openapi → docs/openapi.json → pnpm generate(openapi-ts) → web/src/api/{types,sdk,client,@tanstack/react-query}.gen.ts → task web:check
```

## 설정·환경변수 체계

- **api 설정 단일 진입점**: `api/src/core/config.py`의 `Settings`(pydantic-settings, `env_file=".env"`, `extra="ignore"`, `lru_cache`로 프로세스당 1회 파싱). 섹션: Application / Server / Database / Redis / JWT / OAuth(google·kakao·naver) / Email / LLM / Budget / Frontend / Observability. 파생 프로퍼티 `async_database_url`·`sync_database_url`·`redis_dsn`·`cors_origins_list`·`mail_connection_config`·`llm`.
- **LLM 설정 분리**: 하위 `LLMSettings`(`env_prefix="LLM_"`, 프로바이더 키는 alias로 접두 없이 읽음)가 `settings.llm`으로 파생되고 `as_litellm_kwargs()`로 `ChatLiteLLM` kwargs를 조립한다. `LLM_PROVIDER` 값은 `LLMProvider` StrEnum 검증 + 지원 목록을 담은 커스텀 에러 메시지.
- **환경변수 파일**: 로컬 `api/.env`(비추적), 템플릿 `api/.env.example`(60개 변수) / 운영 `api/.env.prod`(비추적), 템플릿 `api/.env.prod.example`(56개 — `MAILPIT_SMTP_PORT`·`MAILPIT_UI_PORT`·`OPENAI_COMPATIBLE_BASE_URL`·`OPENAI_COMPATIBLE_API_KEY` 4개만 빠지고 나머지는 동일). 두 파일 모두 `api/.gitignore`가 `.env`·`.env.prod`·`.env.local`·`.env.*.local`·`.envrc`로 차단하고 `*.example`만 추적한다.
- **web 빌드 시점 환경변수는 `VITE_API_BASE_URL` 하나** — 5곳에서 각각 `import.meta.env.VITE_API_BASE_URL ?? ''`로 읽는다: `web/src/lib/api-client.ts`(axios baseURL) + raw fetch 경로 4개(`features/editor/api/assist.api.ts`, `features/memory/api/chat.api.ts`, `features/works/api/synopsis-continue.api.ts`, `features/works/api/manuscript-export.api.ts`). dev는 빈 문자열 + Vite 프록시, prod는 API 오리진 주입. `web/.gitignore`가 `.env*`를 전부 차단한다.
- **경로 별칭** `@/*` → `web/src/*`: `web/tsconfig.json` `paths`에 정의하고 `vite-tsconfig-paths`가 Vite·Vitest에 동일 적용.
- **테스트 설정**: `web/vitest.config.ts`(jsdom, `globals: true`, setup `src/test/setup.ts` = jest-dom import 한 줄) / `api/pyproject.toml` `[tool.pytest.ini_options]`(`asyncio_mode=auto`, `pythonpath=["src"]`, 마커 unit·integration·e2e, `filterwarnings = error` + 3개 예외, `--cov-fail-under=70`).
- **에이전트 도구 설정**: `.claude/agents/`에 도메인 역할 카드 5개(api-backend-builder·api-web-integrator·llm-pipeline-engineer·security-tenant-reviewer·web-feature-builder), `.claude/hooks/forge-claim-check.py` 훅, `.claude/settings.local.json`·`launch.json`.

## 린트·타입체크·포맷·커밋 훅

| 영역 | 도구 | 설정 |
|---|---|---|
| api 린트 | `ruff check` — 룰셋 E·W·F·I·N·UP·B·C4·SIM·ANN·S·T20·PT·RUF, line-length 100, ignore ANN401·S101·B008, per-file-ignores 5블록(`tests/**`·`alembic/**`·`scripts/**`·`config.py`·`oauth/*.py`) | `api/pyproject.toml` `[tool.ruff]` |
| api 포맷 | `ruff format` — double quote, space indent, LF | `[tool.ruff.format]` |
| api 타입 | `mypy --strict` + 플러그인 `pydantic.mypy`·`sqlalchemy.ext.mypy.plugin`. 프로토타입 완화 2개(`disallow_any_generics=false`, `warn_return_any=false`), 무-스텁 모듈 12개 `ignore_missing_imports` | `[tool.mypy]` |
| api 커버리지 | `[tool.coverage]` branch=true, `migrations`/`alembic`/`tests` omit, 게이트 70% | `pyproject.toml` |
| api 커밋 훅 | `pre-commit` — 파일 위생 11훅 + `ruff-format` + `ruff --fix --exit-non-zero-on-fix` + local `mypy src/`(`pass_filenames: false`, `files: ^src/`) + `detect-secrets`(baseline `api/.secrets.baseline`) + `commitizen`(Conventional Commits, commit-msg 단계) | `api/.pre-commit-config.yaml` |
| web 린트·포맷 | Biome 1.9.4 — recommended 룰, 2칸 space, 작은따옴표, 줄 폭 100, ES5 trailing comma, `organizeImports`. 무시: `node_modules`·`dist`·`.superpowers`·`.claude`·`src/routeTree.gen.ts`·`src/api`·`docs/openapi.json` | `web/biome.json` |
| web 타입 | `tsc --noEmit`(strict), `exclude: ["src/api"]` | `web/tsconfig.json` |

즉 **web의 두 생성 디렉터리는 tsc·biome 양쪽에서 제외 대상**이다.

## 생성 파일 (직접 수정 금지)

- `web/src/routeTree.gen.ts`(599줄) — `@tanstack/router-plugin`이 `web/src/routes/`에서 빌드 시 생성. `web/.gitignore`가 이 파일 자체를 무시한다.
- `web/src/api/**`(17파일 7,651줄) — `pnpm generate`가 `docs/openapi.json`에서 생성. 플러그인 4개: `@hey-api/client-axios`(런타임 설정 `./src/lib/api-client`, `baseUrl: false`) + `@hey-api/typescript` + `@hey-api/sdk` + `@tanstack/react-query`. `operationId`를 파서 patch로 지워 경로 기반 함수명(`postApiV1ChatStream` 등)을 얻는다.

## 컨테이너·배포

- **로컬 dev는 컨테이너 밖**: `api/docker-compose.yml`은 인프라 3종(postgres·redis·mailpit)만 정의하고 FastAPI는 호스트에서 `uv run uvicorn`으로 hot-reload 실행한다. `app` 서비스 정의는 `api/docker-compose.prod.yml`에만 있고 `--profile prod`로만 기동된다(prod 오버레이는 `restart: always`, `env_file: .env.prod`, `volumes: []`, `APP_ENV=production`, 컨테이너 내부 호스트명 `postgres`/`redis` 주입, mailpit을 `dev-tools` 프로파일로 밀어냄).
- **Dockerfile 3단계**: `uv-binary`(uv 0.6.13 핀) → `builder`(런타임 전용 `/runtime-venv` = `uv sync --no-group dev` + 시스템 Python에 dev 포함 전체 설치 + `uv build --wheel` + `compileall`) → `runtime`(python:3.12-slim-bookworm, libpq5·curl만, 비-root `appuser`, `/runtime-venv`+`alembic`만 복사, uv·pip 부재, `/health` HEALTHCHECK).

```
uv-binary(uv 핀) → builder(deps 레이어 → wheel 레이어) → runtime(venv+alembic 복사, dev 도구 0개)
```

## 알려진 템플릿 잔재 (실행 경로에 영향)

- `api/src/main.py:398` — `if __name__ == "__main__"` 블록의 `uvicorn.run("\1", ...)`. 쿠키커터 치환이 실패한 리터럴이라 `python -m` 직접 실행 경로는 동작하지 않는다. 정상 진입점은 `uvicorn main:app`(Taskfile·`PYTHONPATH=src`)이다.
- `api/Dockerfile:269` — 프로덕션 `CMD`가 `uvicorn fastapi_bootstrap.main:app`을 가리킨다. `fastapi_bootstrap` 모듈은 리포에 존재하지 않는다(문자열은 Dockerfile·Justfile 주석과 테스트 주석에만 등장). 휠은 `packages = ["src"]`로 설치되므로 이 CMD 그대로는 컨테이너가 부팅하지 않는다.
