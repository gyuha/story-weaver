---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# CONVENTIONS

StoryWeaver 모노레포의 코드 스타일·네이밍·패턴·에러 처리 규약을 구현 사실 기준으로 기록한다. 두 부분으로 나뉜다: `api/`(Python, FastAPI) / `web/`(TypeScript, React).

도구는 두 쪽 모두 설정 파일로 강제된다. api는 ruff(린트+포맷) + mypy(strict), web은 biome(린트+포맷). 도메인 용어 정의는 이 문서가 아니라 `.forge/CONTEXT.md` 소관이다.

---

## 1. api/ (Python)

### 1.1 린트·포맷 (ruff)

설정: `api/pyproject.toml` `[tool.ruff]` (라인 134~172).

- `target-version = "py312"`, `line-length = 100`, `src = ["src"]`.
- 포맷(`[tool.ruff.format]`): `quote-style = "double"`(더블쿼트), `indent-style = "space"`, `line-ending = "lf"`.
- 활성화 규칙(`[tool.ruff.lint] select`): `E`(pycodestyle errors), `W`(warnings), `F`(Pyflakes), `I`(isort), `N`(pep8-naming), `UP`(pyupgrade), `B`(flake8-bugbear), `C4`(comprehensions), `SIM`(simplify), `ANN`(flake8-annotations — 타입 힌트 강제), `S`(flake8-bandit — 보안), `T20`(flake8-print — print 금지), `PT`(pytest-style), `RUF`(Ruff 자체 규칙).
- 전역 ignore: `ANN401`(프레임워크/LLM 경계의 동적 kwargs 허용), `S101`(assert 허용), `B008`(FastAPI DI 기본값의 함수 호출 허용 — `Depends()` 패턴 때문).
- per-file-ignores: `tests/**`은 assert·타입힌트·print 등 대거 면제, `alembic/**`·`scripts/**`·`src/core/config.py`·`src/domains/auth/oauth/*.py`에 각각 완화 규칙 적용.

`T20`가 켜져 있으므로 운영 코드에서 `print()`는 금지다. 로깅은 structlog로 한다(아래 1.7).

### 1.2 타입 체크 (mypy strict)

설정: `api/pyproject.toml` `[tool.mypy]` (라인 177~205).

- `python_version = "3.12"`, `strict = true`, `mypy_path = ["src"]`, `explicit_package_bases = true`.
- 플러그인: `pydantic.mypy`, `sqlalchemy.ext.mypy.plugin`.
- strict의 일부만 완화: `disallow_any_generics = false`, `warn_return_any = false`(프로토타입 반복 속도용).
- `ignore_missing_imports`는 stub 없는 외부 라이브러리(`fastapi_mail`, `passlib`, `jose`, `redis`, `slowapi`, `langchain.*`, `litellm` 등)에만 override로 적용.

전 운영 코드는 mypy strict + ruff 통과가 기본 요건이다. 커밋 전 `task lint`(ruff check + mypy)로 검증한다(`api/CLAUDE.md`).

### 1.3 pre-commit

설정: `api/.pre-commit-config.yaml`.

- 모든 린터/포맷터 설정은 `pyproject.toml`에 있고 pre-commit은 호출만 오케스트레이션한다.
- `ruff-format` / `ruff`는 스테이징된 파일만 받아 처리(빠른 per-file 실행).
- `mypy`는 `pass_filenames: false` + `files: ^src/`로, `src/` 하위 파일이 하나라도 스테이징될 때만 트리거되며 항상 `src/` 전체를 대상으로 실행한다.
- 일반 hygiene 훅: trailing-whitespace, end-of-file-fixer, check-yaml/toml/json, detect-private-key, debug-statements 등. `detect-secrets`로 비밀값 스캔.

### 1.4 디렉터리 구성 — Light Modular Monolith (DDD)

`src/`가 Python path 루트(`pythonpath = ["src"]`). 각 도메인은 자기 완결적 5계층으로 구성된다.

```
api/src/
├── core/              # 횡단 관심사 (config, database, redis, middleware, exceptions, logging)
├── domains/
│   ├── auth/          # 인증·인가 (JWT + OAuth + RBAC)
│   ├── chat/          # LLM 프록시·SSE 스트리밍
│   └── shared/        # 공유 커널 (base.py, types.py, events.py)
├── infra/             # 외부 시스템 어댑터 (infra/llm/provider_factory.py)
└── main.py            # FastAPI app factory + lifespan + 라우터 등록
```

각 도메인(`auth`, `chat`)은 동일 패턴을 따른다. 모듈명은 `<도메인>_<계층>.py` 형태로 접두된다:

```
domains/auth/
├── router/auth_router.py        # HTTP 계층 (엔드포인트)
├── service/auth_service.py      # 애플리케이션/비즈니스 로직
├── repository/auth_repository.py # 데이터 접근 (async)
├── models/auth_models.py        # SQLAlchemy ORM
└── schemas/auth_schemas.py      # Pydantic 요청/응답 DTO
```

`chat` 도메인은 추가로 헥사고날 패턴 파일을 둔다: `ports.py`(추상 인터페이스 `LLMClientProtocol` 등), `container.py`(DI 바인딩), `llm_client.py`·`llm_factory.py`(구현체).

규칙(`api/CLAUDE.md`): 도메인 간 직접 DB 모델 import 금지(경계는 ID 또는 이벤트로). src layout 유지.

### 1.5 네이밍

| 대상 | 규약 | 예시 |
|------|------|------|
| 클래스(ORM/Pydantic/Service/Repo) | PascalCase | `User`, `RefreshToken`, `AuthService`, `AuthRepository` |
| 함수 | snake_case | `signup_and_send_email()`, `get_user_by_email()`, `hash_password()` |
| 모듈 | snake_case + 계층 접미 | `auth_router.py`, `auth_service.py`, `auth_models.py` |
| 패키지/도메인 | snake_case | `domains.auth`, `domains.chat`, `core`, `infra` |
| 상수 | UPPER_SNAKE_CASE | `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORRELATION_ID_HEADER` |
| DB 테이블/컬럼 | snake_case | `users`, `refresh_tokens`, `hashed_password`, `created_at` |
| 환경변수 | UPPER_SNAKE_CASE | `LLM_PROVIDER`, `DATABASE_URL`, `REDIS_DSN` |
| 모듈 내부(private) | `_` 접두 | `_get_service()`, `_app_error_to_http()`, `self._session` |

`N`(pep8-naming) 규칙이 ruff로 강제된다.

### 1.6 Pydantic 스키마 / DI 패턴

스키마 접미 규약(`schemas/auth_schemas.py`):
- 요청 본문: `<X>Request` (예: `SignupRequest`, `LoginRequest`, `RefreshRequest`).
- 응답 본문(비밀값 제외): `<X>Response` (예: `UserResponse`, `TokenResponse`).
- Pydantic v2 사용: `Field(min_length=..., max_length=...)` 제약, `@field_validator(..., mode="before")`로 정규화(예: email lowercase+strip), 응답 모델은 `model_config = {"from_attributes": True}`.

DI는 FastAPI `Depends()` 팩토리 패턴. 라우터에 private 팩토리 함수(`_get_service`)를 두고 세션·redis·메일 서비스를 주입해 서비스를 조립한다. 엔드포인트는 `service: AuthService = Depends(_get_service)`로 받는다. `B008`이 ignore된 이유가 이 패턴이다.

```python
async def _get_service(
    session: AsyncSession = Depends(get_async_session),
    redis: Redis = Depends(get_redis_dep),
    mail_service: AuthEmailSender = Depends(get_auth_email_service),
) -> AuthService:
    return AuthService(AuthRepository(session), redis, mail_service=mail_service)
```

### 1.7 SQLAlchemy / 비동기

- 베이스: `api/src/core/database.py`의 `class Base(DeclarativeBase)`. 믹스인 없음.
- `Mapped[T]` + `mapped_column()` 구문(생성자 `Column()` 미사용). UUID PK는 `postgresql.UUID(as_uuid=True)`, default `uuid.uuid4`.
- 타임스탬프: `server_default=func.now()` + `onupdate=func.now()`로 자동 관리.
- 전 I/O 비동기: `AsyncSession`(`get_async_session` 의존성), 엔진 설정 `expire_on_commit=False`, `autoflush=False`, `pool_pre_ping=True`.
- 리포지토리는 `@asynccontextmanager`로 `transaction()`을 제공(중첩 트랜잭션 지원: `begin_nested()` vs `begin()`).

### 1.8 로깅 (structlog)

설정: `api/src/core/logging.py`의 `configure_logging(level, fmt)`. JSON 렌더러(운영) / ConsoleRenderer(개발) 두 모드.

- 프로세서 파이프라인에 `merge_contextvars`(correlation_id 주입), `add_log_level`, `TimeStamper(fmt="iso", utc=True)` 등 포함.
- correlation_id는 `api/src/core/middleware.py`의 `CorrelationIdMiddleware`에서 `X-Correlation-ID` 헤더로 전파, `bind_contextvars`로 structlog 컨텍스트에 바인딩. 요청 종료 시 해제.
- 모듈별 `logger = structlog.get_logger(__name__)`, 구조적 key-value 호출: `logger.info("event_name", key=value)`.

### 1.9 에러 처리

설정: `api/src/core/exceptions.py`.

기반 클래스 `AppError(Exception)` (`message`, `status_code` 속성, 기본 400) 아래 도메인 예외:

```
AppError(Exception)
├── NotFoundError      (404)
├── ConflictError      (409)
├── UnauthorizedError  (401)
└── ForbiddenError     (403)
```

- 핸들러 등록: `register_exception_handlers(app: FastAPI)`가 세 핸들러를 등록 — `HTTPException`(warning 로깅 + `detail` JSON), `RequestValidationError`(422; Pydantic v2 에러를 직렬화 가능하게 정제), 포괄 `Exception`(500; 안전한 "Internal server error" 메시지).
- 라우터는 도메인 예외를 잡아 HTTP로 변환: `except AppError as exc: raise _app_error_to_http(exc) from exc`.
- 에러 응답 JSON은 `{"detail": ...}` 형태이며 모든 응답에 correlation_id 헤더가 포함된다.

서비스/라우터는 HTTP를 직접 던지지 않고 도메인 예외(`AppError` 계열)를 쓰는 것이 패턴이다. HTTP 변환은 경계(라우터/핸들러)에서만 일어난다.

---

## 2. web/ (TypeScript / React)

### 2.1 린트·포맷 (biome)

설정: `web/biome.json` (biome 1.9.4).

- `organizeImports.enabled = true`, `linter.rules.recommended = true`.
- 포맷: `indentStyle = "space"`, `indentWidth = 2`, `lineWidth = 100`.
- JavaScript 포맷: `quoteStyle = "single"`(싱글쿼트 — api의 더블쿼트와 반대), `trailingCommas = "es5"`.
- ignore: `node_modules`, `dist`, `src/routeTree.gen.ts`, `src/api`(생성 코드), `docs/openapi.json` 등 생성·외부 파일 제외.

스크립트(`web/package.json`): `lint`(`biome check .`), `lint:fix`(`biome check --write .`), `format`(`biome format --write .`), `typecheck`(`tsc --noEmit`). 빌드는 `tsc -b && vite build`.

### 2.2 디렉터리 구성 — Feature-Sliced

```
web/src/
├── api/           # @hey-api/openapi-ts 생성 클라이언트 (수정 금지, biome ignore)
├── components/
│   ├── ui/        # 기본 UI 프리미티브 (button, form, input ...)
│   ├── layout/    # 레이아웃
│   └── dev/       # 개발 전용
├── features/      # 기능 도메인 슬라이스
│   ├── auth/      # components/ hooks/ schema/ store/ types/ lib/
│   └── helpdesk/  # components/ hooks/ store/ lib/
├── hooks/         # 전역 커스텀 훅 (use-theme, use-mobile)
├── lib/           # 공유 유틸 (api-client, api-interceptors, router, utils)
├── providers/     # app-providers.tsx (QueryClientProvider)
├── routes/        # TanStack Router 파일 기반 라우트
├── stores/        # 전역 zustand (modal-store)
├── styles/        # globals.css 등
├── main.tsx
└── routeTree.gen.ts  # 자동 생성
```

라우팅은 **TanStack Router 파일 기반**. `src/routes/auth/login.tsx` → `/auth/login`. Vite 플러그인(`tanstackRouter`)이 `src/routeTree.gen.ts`를 자동 생성(`autoCodeSplitting: true`). 라우트는 `createRootRoute()` / `createFileRoute()` API를 쓴다.

기능별 코드는 `features/<feature>/` 아래에 `components/`, `hooks/`, `schema/`, `store/`, `types/`, `lib/`로 슬라이스된다.

### 2.3 네이밍

| 대상 | 규약 | 예시 |
|------|------|------|
| React 컴포넌트 | PascalCase | `ThemeToggle`, `LoginForm`, `HdLoginPage` |
| 파일(컴포넌트 포함) | kebab-case `.tsx`/`.ts` | `theme-toggle.tsx`, `login-form.tsx`, `use-theme.ts`, `auth.store.ts` |
| 함수/변수 | camelCase | `isPending`, `setEmail` |
| 훅 | `use` 접두 camelCase | `useTheme()`, `usePostList()`, `useLoginMutation()` |
| 타입/인터페이스 | PascalCase (일부 인터페이스 `I` 접두) | `ThemeToggleProps`, `AuthState`, `IModalStore` |
| zod 스키마 | camelCase + `Schema` 접미 | `loginSchema`, `signupSchema` |
| zustand 스토어 훅 | `use*Store` | `useAuthStore`, `useModal` |
| 생성 API 함수 | HTTP 동사 접두 camelCase | `postAuthLogin()`, `getBoardsByBoardIdPosts()` |

파일명은 컴포넌트라도 kebab-case이고 내부 컴포넌트 식별자만 PascalCase다(예: `theme-toggle.tsx` → `export function ThemeToggle`).

### 2.4 컴포넌트 패턴

- 함수 선언(`function ComponentName() {}`) 방식. named export 선호(UI 프리미티브 일부는 named + default 혼용).
- props는 인터페이스로 타입 지정(`export interface XProps`).
- UI 프리미티브(`components/ui/`)는 `class-variance-authority`(cva)로 variant 스타일을 정의하고 `cn()`(`lib/utils.ts`)으로 클래스를 병합. 스타일은 Tailwind CSS v4 + clsx + tailwind-merge.
- 라우트 컴포넌트는 `export const Route = createFileRoute('...')({ component: X })` 형태.

### 2.5 훅 / TanStack Query

- 전역 훅은 `src/hooks/`, 기능 훅은 `features/<f>/hooks/`.
- 데이터 패칭은 TanStack Query(`useQuery` / `useMutation`). `queryKey`는 소문자 배열로 합성: `['posts', boardId, page, size]`.
- `queryFn`은 생성된 SDK 함수를 직접 호출 후 `.then((r) => r.data?.data ...)`로 언랩.
- 뮤테이션은 `useQueryClient()` + `onSuccess`에서 `invalidateQueries`로 캐시 무효화. 인증 뮤테이션은 zustand 스토어 갱신 + `useNavigate` 네비게이션을 결합.
- `QueryClient`(`providers/app-providers.tsx`)는 `mutations.retry: false` 기본값.

### 2.6 zod + react-hook-form

- 스키마 위치: `features/<f>/schema/<f>.schema.ts`. `z.object({...})`, 메시지는 한국어, 교차 필드 검증은 `.refine(..., { path: [...] })`.
- 폼 값 타입은 `z.infer<typeof schema>`로 파생(`type LoginFormValues = z.infer<typeof loginSchema>`).
- 폼은 `useForm<T>({ resolver: zodResolver(schema), defaultValues })` (`@hookform/resolvers/zod`)로 구성. `components/ui/form.tsx`의 `Form` / `FormField`(render props) / `FormItem` / `FormLabel` / `FormControl` / `FormMessage` 조합을 사용한다.

### 2.7 API 계층 / 상태 관리

- 생성 클라이언트: `@hey-api/openapi-ts` 0.98.1. 설정 `web/openapi-ts.config.ts` — 입력 `./docs/openapi.json`, 출력 `./src/api`, 플러그인 `@hey-api/client-axios`(runtimeConfig `./src/lib/api-client`) + typescript + sdk + `@tanstack/react-query`. 생성은 `pnpm generate`.
- `src/api`는 수정 금지 영역(biome ignore). 사용은 SDK 함수 + 타입을 import.
- axios 1.16.1. baseURL은 `lib/api-client.ts`의 `createClientConfig`가 `VITE_API_BASE_URL ?? '/api'`로 주입. 인터셉터는 `lib/api-interceptors.ts`(`app-providers`에서 초기화). dev 서버는 `/api` → `http://localhost:8080` 프록시(`vite.config.ts`).
- 상태 관리: zustand 5. 전역 스토어(`stores/modal-store.ts`)는 `devtools` 미들웨어 사용. auth 스토어(`features/auth/store/auth.store.ts`)는 persist 미사용(인메모리 — XSS 방어 목적), JWT 디코딩으로 user/role 추출.

---

## 부록 — 주요 설정 파일

- `api/pyproject.toml` — ruff / mypy / pytest / coverage 설정 단일 소스
- `api/.pre-commit-config.yaml` — pre-commit 오케스트레이션
- `api/CLAUDE.md` — api 개발 규칙 요약
- `web/biome.json` — biome 린트·포맷
- `web/package.json` — 스크립트·의존성
- `web/openapi-ts.config.ts` — API 클라이언트 생성
- `web/vite.config.ts` — Vite/TanStack Router/프록시
