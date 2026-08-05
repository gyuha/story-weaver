---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# 코드 컨벤션

StoryWeaver 모노레포(`api/` FastAPI + `web/` React)에서 **실제로 관찰된** 스타일·네이밍·패턴만 정리한다. 도메인 용어의 *의미*는 `.forge/CONTEXT.md` 소관이므로 여기서는 다루지 않는다(구현 사실만).

규모 기준선(측정값): 손으로 쓴 web 코드 12,242줄(생성물·테스트 제외) / 생성물 8,250줄(`web/src/api` 7,651 + `routeTree.gen.ts` 599) / api `src/` 13,974줄(161 `.py`) / 테스트 27,761줄(web 7,108 + api 20,653).

**CI가 없다** — 저장소에 `.github/`가 존재하지 않는다. 모든 품질 규율은 로컬 `task`/`pnpm` 명령과 pre-commit 훅에만 의존한다.

## web (React 19 + TypeScript)

### 포맷터·린터 — Biome

단일 출처 `web/biome.json`(`@biomejs/biome ^1.9.4`, devDependency):

- `formatter`: `indentStyle: "space"`, `indentWidth: 2`, `lineWidth: 100`
- `javascript.formatter`: `quoteStyle: "single"`, `trailingCommas: "es5"`
- `organizeImports.enabled: true`(import 정렬 자동), `linter.rules: { recommended: true }` — **커스텀 규칙 0개**
- `files.ignore`: `node_modules`, `dist`, `.superpowers`, `.claude`, `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`

명령(`web/package.json`): `pnpm lint` = `biome check .`, `pnpm lint:fix` = `biome check --write .`, `pnpm format` = `biome format --write .`. 패키지 매니저는 `pnpm@10.28.2` 고정, `engines`는 node `>=22.18.0` · pnpm `>=10.0.0`.

### TypeScript

`web/tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, `useDefineForClassFields`, `noEmit`, `target: ES2022`, `module: ESNext`, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, `skipLibCheck: true`, `verbatimModuleSyntax: false`. `types: ["vitest/globals"]`로 테스트 전역을 타입 레벨에서 열어둔다. `exclude: ["src/api"]` — 생성 SDK는 타입체크에서도 빠진다. 별칭 `@/*` → `web/src/*`(`paths` + `vite-tsconfig-paths`, dev/build/test 세 config 모두에 플러그인 배선).

### 파일·심볼 네이밍

- **전부 kebab-case.** `web/src` 안의 `.ts`/`.tsx` 중 대문자로 시작하는 파일명은 0건(`find | grep -E '/[A-Z]'` 무결과) — 컴포넌트 파일도 예외 없다(`web/src/features/works/components/genre-select.tsx`).
- 접미사 규약: 스토어 `*.store.ts`(4개 — `features/{admin,auth,settings}/store/*.store.ts`, `features/shared/store/works.store.ts`), API 파사드 `*.api.ts`(15개), zod 스키마 `*.schema.ts`(3개 — `auth`/`settings`/`works`).
- 컴포넌트는 PascalCase **named export**(`export function GenreSelect(...)`), default export 관행 없음. 훅은 `use` 접두(`useHydrateWorks`, `useAssistStream`, `useChatStream`, `useTheme`, `useMobile`).
- **배럴(`index.ts`)을 쓰지 않는다** — `features/` 아래 `index.ts`가 0개. 항상 구체 경로를 import한다.
- 타입 파일 위치는 **일관되지 않음**: `features/admin/types.ts`·`features/shared/types.ts`(단일 파일)와 `features/auth/types/auth.ts`·`features/settings/types/settings.ts`(디렉터리) 두 형태가 공존한다.

### 기능 단위 구조

`web/src/features/<도메인>/`가 `components / store / types / schema / lib / api / mock`으로 자기 완결. 실제 도메인 **11개**: `admin, auth, chat, editor, landing, memory, settings, shared, timeline, works, world-bible`. 루트 `CLAUDE.md`는 8개(`auth·works·world-bible·editor·timeline·memory·settings·shared`)만 적고 있어 `admin`·`chat`·`landing`이 문서에 누락된 상태다 [High].

하위 디렉터리 구성은 필요한 것만 만든다 — `features/chat/`은 `api/`만, `features/landing/`은 `components/`만 있다. `mock/`은 `admin`·`shared` 둘뿐(초기 mock-first 화면이 실 API로 옮겨간 흔적). 도메인 공유 코드는 `features/shared/`, 횡단 코드는 `web/src/lib/`(`api-client.ts`·`api-interceptors.ts`·`router.ts`·`utils.ts`)·`web/src/hooks/`·`web/src/providers/app-providers.tsx`·`web/src/stores/`(전역 모달).

### 상태 관리 — 미들웨어를 필요만큼만 조합

- **immer**: 큰 정규화 스토어에 사용. `create<WorksState>()(immer((set, get) => ({...})))`(`web/src/features/shared/store/works.store.ts:98-99`) — 액션은 draft를 직접 변이(`state.works.unshift(...)`, `work.chapters = chapters`). 인터페이스에 상태와 액션을 함께 선언하고 액션마다 한국어 JSDoc을 붙인다(이 파일에 24개).
- **persist**: 영속만 필요한 얇은 스토어(`features/auth/store/auth.store.ts:16-17`, `features/settings/store/settings.store.ts:14-15`) — immer 없이 `create<T>()(persist((set) => ({...}), {...}))`.
- **immer만**: `features/admin/store/admin.store.ts:14-15`.
- **devtools**: 전역 모달만(`web/src/stores/modal-store.ts:29-30`).
- 서버 데이터는 `lib/hydrate-*.ts`(4개 — works·chapters·entities·timeline/conflicts)가 TanStack Query 훅으로 받아 Zustand에 밀어 넣는 **하이드레이션 패턴**을 쓴다. mock 시드로 시작한 화면을 실 API로 옮기는 과도기 구조다.

### API 레이어 — 생성 SDK + 도메인 파사드

생성물은 `pnpm generate`(`@hey-api/openapi-ts` 0.98.1)가 `docs/openapi.json`에서 만든다. `web/openapi-ts.config.ts`: `input: '../docs/openapi.json'`, `output.path: './src/api'`, 플러그인 `@hey-api/client-axios`(`runtimeConfigPath: './src/lib/api-client'`, `baseUrl: false`) + `@hey-api/typescript` + `@hey-api/sdk` + `@tanstack/react-query`. `parser.patch.operations`가 모든 `operationId`를 `undefined`로 지워 함수명이 메서드+경로 기반(`getApiV1WorksByWorkId`)으로 생성되게 한다.

앱 코드는 생성 SDK를 **직접 부르지 않고 도메인 파사드로 감싼다**(`features/<d>/api/<name>.api.ts`, 15개). 관례(`features/works/api/works.api.ts:1-3` 주석에 명시):

- 직접 호출 함수는 `{ ...options, throwOnError: true }`로 넘겨 `data`만 반환(에러는 throw) → `export const worksApi = { list, create, detail, update, remove }`
- Query/mutation 옵션은 생성된 `*Options`/`*Mutation`을 도메인 이름으로 재노출 → `export const worksQueries = { list: getApiV1WorksOptions, ... }`

클라이언트 설정은 `web/src/lib/api-client.ts` — `baseURL: import.meta.env.VITE_API_BASE_URL ?? ''`(dev는 빈 문자열 → Vite 프록시 `/api` → `http://localhost:8000`, rewrite 없음, `web/vite.config.ts`). 인터셉터는 `web/src/lib/api-interceptors.ts`: `createRefreshCoordinator`가 **단일-비행(single-flight)** 401 리프레시를 보장하고(`inflight` 프라미스 공유), `refreshAccessToken()`을 export해 axios를 우회하는 raw `fetch` SSE 경로(`features/editor/api/assist.api.ts`)가 같은 코디네이터를 재사용한다. 순환 의존은 런타임 `import('@/features/auth/api/auth.api')`로 끊는다.

### 스키마 정의 (zod)

`zod ^3.24.2`. 관찰된 용도 두 가지 — (1) 폼 검증: `@hookform/resolvers`의 `zodResolver`를 쓰는 곳은 `features/settings/components/account-screen.tsx` **한 곳뿐**이다(react-hook-form은 의존성에 있지만 zod 연동은 이 파일 한정). (2) 정적 데이터 검증: `features/works/schema/genre-presets.schema.ts`가 `genre-presets.json`을 **모듈 로드 시 1회** `GenrePresetsSchema.parse(...)`로 통과시켜 잘못된 프리셋을 즉시 throw한다(주석 `// eco: 모듈 로드 시 1회 검증 — 실패하면 즉시 throw해 잘못된 프리셋 데이터를 조기에 드러낸다`). 장르 키 타입은 `keyof typeof genrePresetsJson`으로 JSON에서 파생 — JSON이 단일 출처.

### 스타일링

Tailwind v4(`@tailwindcss/vite`, config 파일 없이 플러그인만). 조건부 클래스는 `cn(...)` = `twMerge(clsx(inputs))`(`web/src/lib/utils.ts`). `web/src/components/ui/` 아래 shadcn 계열 프리미티브 31개(`button.tsx`·`dialog.tsx`·`command.tsx` …)가 있고 그중 5개가 `class-variance-authority`로 variant를 정의한다. 임의값(`text-[11px]`, `bg-[#edf3ec]`)과 의미론적 토큰(`bg-paper`, `text-ink`, `border-line`)이 섞여 쓰인다.

### 라우팅 (TanStack Router, 파일 기반)

각 라우트 파일은 `createFileRoute('<경로>')({ component, beforeLoad? })`를 `Route`로 export. 동적 세그먼트는 `$param` 파일명(`src/routes/works/$workId/read/$chapterId.tsx`). 빌드 배선은 `web/vite.config.ts`의 `tanstackRouter({ target: 'react', routesDirectory: 'src/routes', generatedRouteTree: 'src/routeTree.gen.ts', autoCodeSplitting: true })`. 인증 게이트는 `src/routes/index.tsx`가 `useAuthStore`로 판단해 리다이렉트.

### 에러 처리 (컴포넌트 레벨)

`try/catch` + `sonner` 토스트가 유일한 사용자 피드백 경로다 — `sonner`를 import하는 파일 19개, 비-테스트 코드의 `toast.error` 30회 / `toast.success` 16회. 관행은 **실패해도 로컬 상태를 롤백하지 않고 사용자 입력을 보존**하는 것이며, 테스트가 이를 계약으로 못 박았다(`web/src/features/editor/components/__tests__/manuscript.test.tsx:302` — `'저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다'`). 같은 원칙의 변형이 `features/settings/components/account-screen.tsx:130`에도 있다: `// eco: 서버 저장 실패는 조용히 무시 — 로컬 테마 적용은 이미 끝났으므로 사용자 경험에 영향 없음.`

### 주석 관행

- JSDoc(`/** */`)은 `features/`에 135개, 그 밖(`components` 9 · `lib` 2 · `hooks` 1 · `routes` 2)에는 희소 — 스토어 액션과 파사드 함수에 집중된다.
- 한 줄 주석은 **한국어 211줄 / 영어 204줄**로 사실상 반반이다. 영어는 주로 `components/ui/`(shadcn 유래)와 `features/settings/`, 한국어는 도메인 로직 쪽.
- `// eco:` 접두 주석이 **29곳** 실재한다 — forge eco(단순화 우선) 모드의 근거 메모로 "왜 이 정도로만 처리했는지"를 남긴다(`features/memory/components/memory-panel.tsx:535,599`, `features/shared/store/works.store.ts:293`, `features/works/components/__tests__/genre-select.test.tsx:7`).

### 생성물 — 직접 편집 금지

`web/src/routeTree.gen.ts`(599줄, TanStack Router 플러그인)와 `web/src/api/**`(7,651줄, openapi-ts). **둘 다 `biome.json.files.ignore`와 `tsconfig.json.exclude`에 들어 있어 린트·타입체크가 적용되지 않는다** — 손으로 고치면 다음 `pnpm generate`/빌드에 조용히 덮인다.

### 선언됐지만 안 쓰이는 의존성 [High]

`web/package.json`에 있으나 `web/src`에서 import 0건: `i18next`·`react-i18next`(로케일 파일도 없음), `@faker-js/faker`, `recharts`. 국제화·차트·시드 데이터는 아직 코드로 존재하지 않는다.

## api (FastAPI + Python 3.12)

### 포맷터·린터 — Ruff

`api/pyproject.toml` `[tool.ruff]`: `target-version = "py312"`, `line-length = 100`, `src = ["src"]`. `[tool.ruff.format]`: `quote-style = "double"`(**web의 작은따옴표와 반대**), `indent-style = "space"`, `line-ending = "lf"`.

`[tool.ruff.lint].select`: `E, W, F, I, N, UP, B, C4, SIM, ANN, S, T20, PT, RUF`. 전역 `ignore`: `ANN401`(프레임워크/LLM 경계의 동적 kwargs), `S101`(assert), `B008`(FastAPI DI 기본값 패턴). `per-file-ignores`가 영역별로 완화한다 — `tests/**`(`S101, ANN, T20, S104, S105, S106, B017, PT011, N806, PT018, E501`), `alembic/**`(`ANN, N999, E501`), `scripts/**`(`T20, ANN, S310, S104, S603, S607, UP036, E501, N806`), `src/core/config.py`(`S104`), `src/domains/auth/oauth/*.py`(`S105`).

### 타입 — mypy strict

`[tool.mypy]`: `python_version = "3.12"`, `strict = true`, `mypy_path = ["src"]`, `explicit_package_bases = true`, `exclude`로 `src/__init__.py`·`src/__main__.py` 제외, `plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]`. 프로토타입 단계 완화 두 개: `disallow_any_generics = false`, `warn_return_any = false`. `ignore_missing_imports` 대상: `fastapi_mail.*`, `passlib.*`, `jose.*`, `alembic.*`, `redis.*`, `slowapi.*`, `langchain*`, `litellm.*`, `pgvector.*`.

### 구조 — 도메인별 5계층(단, 균일하지 않음)

`src/`가 PYTHONPATH 루트. 도메인 15개(`assist, auth, budget, chat, conflicts, dynamic_update, image_generation, manuscript, memory, moderation, relationships, shared, timeline, works, worldbible`)가 `models / repository / service / router / schemas` 패키지로 구성되지만 **필요한 계층만 만든다** — `image_generation`·`moderation`은 `service/`만, `budget`은 `service/` + `dependency.py`, `conflicts`·`relationships`는 `models/`·`repository/` 없이 라우터+서비스+스키마만 있다. `shared`는 계층이 아니라 `base.py`·`events.py`·`types.py`다.

계층 패키지 밖에 **플랫 헬퍼 모듈**을 두는 것도 관행이다: `assist/tier_routing.py`·`assist/correct_cache.py`, `chat/ports.py`·`container.py`·`llm_client.py`·`llm_factory.py`, `memory/embedding_client.py`, `auth/security.py`·`email.py`·`admin_ops.py`, `conflicts/rules.py`.

파일명은 `<도메인>_<계층>.py`가 기본(`works_models.py`, `works_repository.py`)이고, 한 계층에 여러 관심사가 생기면 의미 기반 이름을 쓴다(`chat/service/chat_context_service.py`, `dynamic_update/service/{extraction,suggestion}_service.py`, `manuscript/service/export_service.py`, `memory/service/memory_search_service.py`, `chat/{models/llm_call_log.py,repository/llm_call_log_repository.py}`). `__init__.py`는 `from .works_service import *  # noqa: F403` 형태의 와일드카드 재노출만 담는다.

`domains/shared/base.py`는 DDD 기반 클래스(`Entity`/`AggregateRoot`/`ValueObject`, 순수 dataclass)를 제공하지만 **ORM 모델은 이를 상속하지 않는다** — 모델은 `core.database.Base`를 직접 상속한다(파일 docstring이 명시). 즉 이 base는 현재 실사용이 거의 없는 스캐폴딩이다.

### DB 식별자 네이밍

SQLAlchemy 2.x `Mapped[...]` + `mapped_column(...)` 타이핑 스타일. 컬럼은 스네이크케이스, 테이블은 복수형(`__tablename__ = "works"`). PK는 `UUID(as_uuid=True), primary_key=True, default=uuid.uuid4`, FK는 `ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True`. 타임스탬프는 `Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)`이고 `updated_at`엔 `onupdate=func.now()`가 붙는다. 배열은 `postgresql.ARRAY(String)` + `server_default="{}"`. 모델마다 `__repr__`를 정의한다(`api/src/domains/works/models/works_models.py:26-52`).

### 의존성 주입 (DI)

라우터마다 프라이빗 팩토리를 두고 엔드포인트 인자로 다시 주입한다 — `async def _get_service(session: AsyncSession = Depends(get_async_session)) -> WorksService: return WorksService(WorksRepository(session))` → `service: WorksService = Depends(_get_service)`(`api/src/domains/works/router/works_router.py:46-51`). 이런 팩토리가 14개이며 한 라우터가 여러 서비스를 조립하면 이름을 붙인다(`_get_works_service`, `_get_chat_context_service`, `_get_suggestion_service`).

계층 책임 분리가 명확하다: **리포지토리는 `add`/`flush`만 하고 커밋하지 않는다**(요청 단위 세션 `get_async_session`이 성공 시 커밋 — `works_repository.py` docstring), **서비스는 `user_id: uuid.UUID`만 받고 auth `User` 모델을 도메인 안으로 들이지 않는다**(`works_service.py` docstring, `api/CLAUDE.md`의 도메인 경계 규칙). 덕분에 서비스는 fake 리포지토리로 그대로 치환된다.

### API 스키마 — camelCase 브리지 (중복 존재)

Pydantic 필드는 스네이크케이스로 쓰고 응답만 camelCase로 직렬화한다:

```python
class _CamelModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)
```

프론트 목업 타입(`web/src/features/shared/types.ts`)과 필드명을 맞추기 위한 브리지다. **이 클래스가 공유되지 않고 10개 모듈에 각각 재정의돼 있다** [High] — `works`/`timeline`/`memory`/`worldbible`/`manuscript`/`conflicts`/`relationships`/`dynamic_update`의 `*_schemas.py`와, 스키마를 라우터 안에 둔 `assist_router.py:74`·`chat_router.py:628`. `domains/shared/`로 승격되지 않은 복붙 지점.

### 에러 처리

`core/exceptions.py`가 도메인 예외 계층(`AppError` ← `NotFoundError` 404 / `ConflictError` 409 / `UnauthorizedError` 401 / `ForbiddenError` 403)을 제공한다. 서비스가 raise(41곳)하고 라우터가 `except AppError as exc: _raise_http(exc)`로 `HTTPException`으로 변환한다 — `def _raise_http(exc: AppError) -> NoReturn: raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc`가 **6개 라우터에 각각 복제**돼 있다(`works`·`manuscript`·`assist`·`worldbible`·`chat`·`timeline`).

앱 전역은 `register_exception_handlers(app)`가 `HTTPException`/`RequestValidationError`/미처리 `Exception` 세 개를 `{"detail": ...}` JSON으로 통일하고 요청의 `X-Correlation-ID`를 응답 헤더에 되붙인다. 422 응답은 `_sanitize_validation_errors`가 Pydantic v2의 직렬화 불가 `ctx['error']`를 문자열로 바꾸고 `url`(문서 링크)을 떼어낸 뒤 반환한다. 미처리 예외는 내부 메시지를 숨기고 `"Internal server error."`만 내보낸다.

소유권 위반은 403이 아니라 **404**(`NotFoundError`)로 처리해 교차 테넌트 존재 여부를 노출하지 않는다(`works_service.py` docstring, ADR-0005 참조).

### 로깅

`structlog` 단일 경로(`core/logging.py:27` `configure_logging(level, fmt)`). 프로세서 체인: `contextvars.merge_contextvars` → `stdlib.add_logger_name` → `stdlib.add_log_level` → `processors.TimeStamper(fmt="iso", utc=True)` → 렌더러(dev `dev.ConsoleRenderer(colors=True)` / prod `processors.JSONRenderer(ensure_ascii=False)`). `core/middleware.py:34` `CorrelationIdMiddleware`가 요청마다 `X-Correlation-ID`(없으면 `uuid4()`)를 `structlog.contextvars`에 bind하고 응답 헤더에 실어 보내므로 같은 요청의 모든 로그가 자동으로 묶인다. 로거는 모듈마다 `structlog.get_logger(__name__)`(21곳), 호출은 `logger.warning("event_name", key=value)` 식 구조화 키워드. `print`는 ruff `T20`으로 금지(`tests/**`·`scripts/**`만 예외).

### 횡단 데코레이터

LLM 엔드포인트에는 `@limiter.limit(LLM_RATE_LIMIT)`(`core/rate_limit.py`, slowapi + Redis)를 붙인다 — `assist_router.py`에 6곳, `manuscript`·`chat`·`works` 라우터에도 적용. 스트리밍 응답은 `sse_starlette`(`assist`/`chat`/`manuscript` 라우터, `chat/llm_client.py`, `chat/service/chat_service.py`).

### 주석·docstring 관행

`domains/` 아래 비-`__init__` 모듈 **77개 전부가 1행부터 모듈 docstring으로 시작한다** [High]. 언어는 한국어 54 / 영어 23이며, `core/`+`infra/`는 반대로 영어 11 / 한국어 1(초기 템플릿 유산). docstring은 "무엇"보다 **"왜"와 계약**을 적는 관행이다 — `works_models.py:1-7`은 소유 루트가 `users`이고 파생 필드(`stats`·`reviewSummary`·`lastEditedLabel`)를 저장하지 않는다는 설계 근거를, `works_router.py:1-6`은 교차 테넌트 접근이 404라는 계약을 남긴다. 참조는 reST 롤(``` :class:` ` ```, ``` :func:` ` ```) 스타일.

`from __future__ import annotations`가 `src/` 161개 `.py` 중 88개에 있다 — 도메인 모듈에서는 사실상 모든 파일의 docstring 직후 첫 import다.

### Alembic

`api/alembic/versions/`에 2개(`0001_initial_schema.py`, `0002_purge_empty_embeddings.py`). 리비전 ID는 파일명과 같은 숫자 접두 슬러그(`revision: str = "0001_initial_schema"`). 규칙(`api/CLAUDE.md`): autogenerate 결과 SQL을 **리뷰한 뒤** 커밋.

## 커밋 메시지 형식

Conventional Commits `<type>(<scope>): <한국어 설명>`을 실제로 따른다. 최근 120커밋 집계: `feat` 16 · `chore` 8 · `fix` 6 · `docs` 6 · `refactor` 1 · `perf` 1. scope는 `web` 12 · `forge` 5 · `api` 4 · `moderation` 1 · `agents` 1 · 다중 결합 `api,web` 1. 예: `feat(web): AI 이어쓰기 UI 통일·후보 파싱·취소 배선, 새 화 이동과 자동 저장`, `fix(api,web): 새 부 생성 첫 클릭이 멈추던 문제 수정 — 임베딩 모델 워밍업`. 이슈 연동 커밋은 제목에 `(Fixes #N)`을 붙인다.

`api/.pre-commit-config.yaml`이 `commitizen` v3.30.0을 `commit-msg` 스테이지에 걸어 형식을 강제한다(커스텀 type 목록 설정 파일은 없어 commitizen 기본 스키마 적용, [Medium]). 초기 이력에는 규칙 밖 커밋도 남아 있다(`update`, `패스워드 변경 및 디자인 파일 변경`, `Initial commit`, merge 커밋).

## 금지 사항

- `web/src/routeTree.gen.ts`·`web/src/api/**` 직접 편집 금지(생성물, 린트·타입체크 사각지대).
- 도메인 간 직접 DB 모델 import 금지(`api/CLAUDE.md`) — 경계는 ID 또는 이벤트로 넘는다. 서비스 시그니처가 `User`가 아니라 `user_id: uuid.UUID`인 이유.
- `src` layout 유지 — import는 `src` 기준(`PYTHONPATH=src`).
- Alembic autogenerate 결과는 리뷰 후 커밋.
- 비밀값은 `.env`(로컬)·`.env.prod`(운영)에만. 커밋 금지이며 `detect-secrets`(baseline `api/.secrets.baseline`)와 `detect-private-key` 훅이 스캔한다.
- `print` 금지(ruff `T20`) — 로깅은 structlog.

## pre-commit 훅 구성

설정은 `api/.pre-commit-config.yaml` 하나지만, 설치된 훅(`.git/hooks/pre-commit`)이 **저장소 루트**에서 `--config=api/.pre-commit-config.yaml`로 실행되므로 web만 건드리는 커밋에도 관여한다. `default_language_version: python3.12`.

체인: **pre-commit-hooks v5.0.0** (`trailing-whitespace --markdown-linebreak-ext=md` / `end-of-file-fixer` / `check-yaml` / `check-toml` / `check-json` / `check-added-large-files --maxkb=1000` / `check-merge-conflict` / `check-case-conflict` / `debug-statements` / `detect-private-key` / `mixed-line-ending --fix=lf`) → **ruff-pre-commit v0.9.0** (`ruff-format`, `ruff --fix --exit-non-zero-on-fix`, 둘 다 `types_or: [python, pyi]`) → **로컬 mypy** (`language: system`, `entry: uv run mypy`, `args: [src/, --config-file=pyproject.toml]`, `pass_filenames: false`, `files: ^src/`) → **detect-secrets v1.5.0** (`--baseline api/.secrets.baseline`, `exclude: .env.example|.secrets.baseline|pnpm-lock.yaml`) → **commitizen v3.30.0** (commit-msg).

**확인된 불일치 — mypy 훅은 사실상 절대 트리거되지 않는다 [High].** 훅의 `files: ^src/`는 pre-commit이 git 최상위(`git rev-parse --show-toplevel` = 저장소 루트) 기준의 staged 경로에 매칭하는데, 이 모노레포에서 실제 경로는 `api/src/...`다. 직접 검증: `re.search(r'^src/', 'api/src/domains/works/service/works_service.py')` → `False`(`'src/...'`일 때만 `True`). 같은 파일의 `detect-secrets`가 `--baseline api/.secrets.baseline`(루트 기준 경로)을 쓰는 것이 루트 기준 해석의 교차 증거다. 즉 **타입 검증은 커밋 시 자동으로 걸리지 않고 `task api:lint`(= `ruff check src tests` + `mypy src`) 수동 실행에만 의존한다**. ruff 훅들은 `types_or` 파일-타입 매칭이라 이 문제의 영향을 받지 않는다.

설치·실행: `task api:pre-commit-install`(= `uv run pre-commit install`), 전체 감사 `task api:pre-commit-run`(= `uv run pre-commit run --all-files`), baseline 재생성 `task api:secrets-baseline`.

**web에는 pre-commit/husky가 없다.** `web/Taskfile.yml`의 `check`는 `typecheck` + `lint`뿐이고 **test를 실행하지 않으며**, 루트 `task check`도 `web:check`를 그대로 호출한다. 루트 `CLAUDE.md`는 "커밋 전 typecheck·lint·test 통과가 기본"이라 적지만 그 test는 어떤 자동 경로로도 강제되지 않는다 — CI도 없으므로 순수 관례다.
