---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# ARCHITECTURE

StoryWeaver는 두 부분으로 구성된 모노레포다.

- `api/` — Python FastAPI 백엔드. Light Modular Monolith + DDD 레이어링.
- `web/` — React 19 + Vite 프론트엔드. TanStack Router(file-based) + TanStack Query + Zustand.

이 문서는 **현재 코드의 실재 구조**를 기록한다(설계 의도가 아니라 실제 구현 기준). 특히 `web/`은 상당 부분이 스캐폴딩/템플릿 잔재 상태이며, 그 사실을 그대로 기술한다.

---

## 1. API 백엔드 (`api/`)

### 1.1 진입점과 앱 팩토리

진입점은 `api/src/main.py`다. `create_app()` 팩토리가 `FastAPI` 인스턴스를 만들고, 모듈 레벨에서 `app: FastAPI = create_app()`를 노출한다. uvicorn은 `app.main:app`를 임포트한다. `api/src/__main__.py`는 `python -m`(또는 `python -m app`) 실행 시 uvicorn을 직접 띄우는 대체 진입점이며, dev에서 reload를 켠다(`settings.is_development()`).

`src/`가 Python path 루트다(`pyproject.toml`의 `pythonpath = ["src"]`, `mypy_path = ["src"]`, `[tool.ruff] src = ["src"]`, `[tool.hatch.build.targets.wheel] packages = ["src"]`). 따라서 모든 임포트는 `src` 기준 절대 경로(`from core.config import settings`, `from domains.auth...`)다.

`create_app()`이 조립하는 것 (`api/src/main.py`):

- **Rate limiter**: `slowapi.Limiter`(`limiter` 모듈 전역). 키 함수 `_get_user_key`는 `request.state.user.id`가 있으면 `user:<id>`, 없으면 remote IP. `RateLimitExceeded` 핸들러 등록.
- **미들웨어** (바깥→안쪽 순): `CorrelationIdMiddleware`(`api/src/core/middleware.py`) → `CORSMiddleware`(origin은 `settings.cors_origins_list`, `expose_headers=["X-Correlation-ID"]`).
- **예외 핸들러**: `register_exception_handlers(application)` (`api/src/core/exceptions.py`).
- **라우터 등록**: `_register_routers()`가 health 라우터(`/health`, `/ready`)를 등록하고, auth/chat 도메인 라우터를 `try/except ImportError`로 감싸 `/api/v1` prefix로 include.

### 1.2 Lifespan

`lifespan` 컨텍스트 매니저(`api/src/main.py`):

- **startup**: `configure_logging(...)`(`api/src/core/logging.py`) → Redis 연결 풀 워밍(`get_redis_client()` + `ping`).
- **shutdown**: `close_redis_client()`.

`/ready` 엔드포인트는 Postgres(`SELECT 1`), Redis(`ping`), Mailpit SMTP(220 배너) 실시간 연결을 검사하고 하나라도 실패하면 503을 반환한다.

```
uvicorn → create_app() → 미들웨어/예외핸들러/라우터 조립 → lifespan(startup: 로깅+Redis) → 요청 처리
```

### 1.3 DDD 도메인 구조 (Light Modular Monolith)

각 bounded context는 `api/src/domains/<bc>/` 아래에서 자기 완결적이다. 표준 레이어:

```
domains/<bc>/
  router/      — HTTP 어댑터 (FastAPI APIRouter). DTO 검증, AppError→HTTPException 변환.
  service/     — 비즈니스 로직. HTTP를 모름. AppError 계열을 raise.
  repository/  — DB I/O 전담 (SQLAlchemy async). SQL을 service 밖으로 격리.
  models/      — SQLAlchemy ORM 모델 (core.database.Base 상속).
  schemas/     — Pydantic 요청/응답 DTO.
```

현재 존재하는 도메인:

- `api/src/domains/auth/` — 인증·인가(JWT + OAuth + RBAC). 추가로 `security.py`(토큰/해시/RBAC 의존성), `email.py`(트랜잭션 메일), `oauth/`(google/kakao/naver 어댑터).
- `api/src/domains/chat/` — LLM 프록시 + SSE 스트리밍. 추가로 `ports.py`(헥사고날 포트), `container.py`(DI), `llm_client.py`(LangChain+litellm 어댑터), `llm_factory.py`(litellm 모델 문자열 라우팅).
- `api/src/domains/shared/` — 도메인 공유 기반 코드. `base.py`(DDD `Entity`/`AggregateRoot`/`ValueObject` 데이터클래스), `types.py`(`NewType` 식별자 `UserId`/`RoleId`/...), `events.py`(인프로세스 도메인 이벤트 버스).

### 1.4 횡단 관심사 (`api/src/core/`)

- `config.py` — `pydantic_settings` 기반 `Settings`(`get_settings()`는 `lru_cache` 싱글톤, 모듈 전역 `settings`). `.env`에서 로드. 파생 프로퍼티: `async_database_url`(asyncpg), `sync_database_url`(psycopg2, Alembic용), `redis_dsn`, `cors_origins_list`, `mail_connection_config`, `llm`(LLMSettings 빌더). `AppEnv`/`LLMProvider`/`LogFormat` enum 정의.
- `database.py` — `create_async_engine`(pool_size=5, max_overflow=10, pool_recycle=3600, pool_pre_ping), `AsyncSessionFactory`(`expire_on_commit=False`), 선언적 `Base`, FastAPI 의존성 `get_async_session`(yield 후 commit, 예외 시 rollback).
- `redis.py` — 모듈 싱글톤 `redis.asyncio.Redis`(lazy init, `decode_responses=True`, max_connections=20). `get_redis_client()`/`get_redis_dep`(FastAPI 의존성)/`close_redis_client()`.
- `middleware.py` — `CorrelationIdMiddleware`. 들어온 `X-Correlation-ID`를 재사용하거나 uuid4 생성, structlog contextvars에 바인딩, 응답 헤더에 부착, request_started/finished 로그.
- `exceptions.py` — `register_exception_handlers`로 `HTTPException`/`RequestValidationError`(422, 구조화)/`Exception`(500) 핸들러 등록. 응답에 `detail` 필드와 `X-Correlation-ID` 포함. `AppError`/`ConflictError`/`NotFoundError`/`UnauthorizedError` 등 도메인 예외 계열 정의.
- `logging.py` — structlog 설정(`configure_logging`).

### 1.5 도메인 격리 규칙 (실재)

- 도메인 service는 HTTP를 모른다. 라우터가 `AppError`를 `HTTPException`으로 변환(`auth_router.py`의 `_app_error_to_http`, `_register_routers`).
- chat 도메인의 service/ports는 LangChain·litellm 타입을 `TYPE_CHECKING` 블록에서만 임포트한다(`chat_service.py`, `chat/ports.py`). 런타임에는 포트 추상화에만 의존 — 헥사고날 경계.
- **단, chat 라우터는 auth 도메인을 직접 임포트한다**: `chat_router.py`가 `from domains.auth.security import get_current_user, require_permission`을 사용한다(인증/RBAC 공유). 즉 "도메인 간 직접 import 금지"는 chat→auth.security에 대해서는 적용되지 않으며, security 의존성이 도메인 횡단 인증 진입점 역할을 한다.
- `domains/shared/base.py`의 DDD 베이스 클래스는 순수 dataclass이고 SQLAlchemy `Base`를 상속하지 않는다. ORM 모델은 각 도메인 `models/`에서 `core.database.Base`를 직접 상속한다. (현재 ORM 모델은 `shared.base`의 `Entity`/`AggregateRoot`를 사용하지 않는다.)

### 1.6 인증 흐름 (JWT + OAuth + RBAC)

핵심 파일: `api/src/domains/auth/security.py`, `service/auth_service.py`, `router/auth_router.py`, `models/auth_models.py`, `oauth/*.py`.

**토큰 전략** (`security.py`):
- Bearer 헤더 전용(쿠키 없음), `HTTPBearer(auto_error=False)`.
- Access token TTL 15분, refresh token TTL 7일, 알고리즘 HS256, 비밀키 `settings.jwt_secret_key`.
- 비밀번호 해시는 argon2 (`passlib` `CryptContext(schemes=["argon2"])`).
- `create_access_token`/`create_refresh_token`/`decode_token`/`hash_token`(SHA-256). refresh 토큰은 JWT로 인코딩하되 DB에는 raw 값의 SHA-256 해시(`token_hash`)만 저장.
- Redis JWT 블랙리스트: `jwt:blacklist:<jti>` 키, TTL=토큰 만료까지. `blacklist_jti`/`is_jti_blacklisted`.

**FastAPI 의존성** (`security.py`):
- `get_current_user` — Bearer 추출 → JWT 검증 → `type=="access"` 확인 → jti 블랙리스트 확인 → DB에서 User 로드(`selectinload(roles).selectinload(permissions)`) → `is_active` 확인.
- `get_current_access_token_context` — 현재 access token의 jti/exp 추출(로그아웃 블랙리스팅용).
- `require_permission(key)` — RBAC 의존성 팩토리. `user.has_permission(key)` 검사, 실패 시 403.

**로그인/리프레시 로직** (`auth_service.py`):
- `signup_and_send_email` → `signup`(이메일 정규화, 중복 검사 → ConflictError, argon2 해시, 이메일 인증 토큰 생성, 기본 "user" 롤 할당) → 인증 메일 발송.
- `login` → 자격 검증 + `is_active`/`is_verified` 확인 → `_issue_tokens`(access+refresh 쌍 발급, refresh 행 DB 저장).
- `refresh` → `decode_token` → DB에서 `get_refresh_token_by_jti_for_update`(row lock) → **재사용 탐지**: 토큰이 없거나 이미 revoked면 reuse로 간주하여 `invalidate_all_user_sessions`(계정 전체 세션 폐기) → 정상이면 새 토큰 발급 후 기존 row를 `rotated` 표시(같은 트랜잭션). `family_id`로 rotation chain 추적.
- `logout` → refresh 토큰 revoke + access jti 블랙리스트.
- `request_password_reset`(사용자 열거 방지를 위해 항상 202) / `confirm_password_reset`(토큰 검증 후 비밀번호 변경 + 전 세션 폐기).

**RBAC 데이터 모델** (`auth_models.py`): `User` ↔ `Role`(M:N `user_roles`) ↔ `Permission`(M:N `role_permissions`). `User.has_permission(key)`가 롤→퍼미션을 순회. 부수 모델: `RefreshToken`(jti/token_hash/family_id/rotated_at/replaced_by_jti/revoked), `EmailVerification`, `PasswordReset`, `OAuthAccount`(`UniqueConstraint(provider, provider_user_id)`).

**OAuth 흐름** (`auth_router.py` + `oauth/`):
- `GET /auth/oauth/{provider}/login` — 어댑터(`_get_oauth_adapter`로 google/kakao/naver 분기)가 authorization URL + state nonce 생성. state를 Redis `oauth:state:<state>`에 TTL 600초 저장(CSRF).
- `GET /auth/oauth/{provider}/callback` — Redis에서 state 검증·삭제 → `adapter.exchange_code`(naver는 code+state) → `oauth_provision_user`(OAuthAccount 조회 또는 email로 User 매칭/생성 + 기본 롤) → JWT 쌍 반환.
- 어댑터(`oauth/google.py` 등)는 `httpx`로 provider 토큰/유저인포 엔드포인트 호출.

```
login: 자격검증 → is_active/is_verified → access+refresh 발급 → refresh DB 저장
refresh: decode → row lock 조회 → (없음/revoked? → 전 세션 폐기) → 신규 발급 + 기존 rotated 표시
oauth: login URL+state(Redis) → 사용자 동의 → callback(state 검증) → exchange_code → provision → JWT
보호된 요청: Bearer → JWT 검증 → type=access → jti 블랙리스트 확인 → User 로드 → (require_permission RBAC)
```

### 1.7 Chat SSE 스트리밍 흐름

핵심 파일: `api/src/domains/chat/router/chat_router.py`, `service/chat_service.py`, `ports.py`, `container.py`, `llm_client.py`, `llm_factory.py`, `api/src/infra/llm/provider_factory.py`, `models/chat_models.py`.

**헥사고날 + DI 체인** (`container.py`):
```
요청 → get_chat_service(factory=get_llm_factory())
        → factory.get_llm_client()  # DefaultLLMClientFactory → LLMClient(ChatLiteLLM 래핑)
        → ChatService(llm_client=<AbstractLLMPort>)
        → ChatService.complete() / .stream()
```
- `ports.py` — `AbstractLLMPort`(ABC, `invoke`/`stream`), `LLMClientProtocol`(`@runtime_checkable` Protocol, `ainvoke`/`astream`), `LLMClientFactoryProtocol`. ChatService는 포트에만 의존.
- `container.py` — `get_llm_factory()`가 `DefaultLLMClientFactory`를 **함수 내부 lazy import**로 바인딩(인프라 클래스를 모듈 네임스페이스에 노출하지 않음). 테스트는 `app.dependency_overrides[get_llm_factory]`로 스텁 주입.
- `llm_client.py` — `LLMClient`(ChatLiteLLM 래퍼, `ainvoke`/`astream`), `DefaultLLMClientFactory`.
- `infra/llm/provider_factory.py` — LangChain `ChatLiteLLM` 생성 단일 소스. `langchain_litellm`을 여기서만 임포트.

**provider 교체**: 모든 라우팅 로직이 `core/config.py`의 `LLMSettings.as_litellm_kwargs()`와 `llm_factory.ProviderFactory`에 집중. `.env`의 `LLM_PROVIDER`(openai/anthropic/gemini/azure/ollama) + 해당 API 키만 바꾸면 코드 변경 없이 전환. 모델 문자열은 `<provider>/<model>`(azure는 `azure/<deployment>`).

**스트리밍 엔드포인트** (`chat_router.py`):
- `POST /chat/complete` — 비스트리밍. ChatRequest를 LangChain 메시지로 변환(`_to_langchain_messages`) → `service.complete` → `ChatResponse`. 제공자 오류는 502.
- `POST /chat/stream` — `sse_starlette.EventSourceResponse`. `service.stream`의 각 청크를 `{"data": chunk}` SSE 이벤트로, 종료 시 `{"data": "[DONE]"}`, 오류 시 `{"event": "error", ...}`.
- `GET /chat/provider` — 활성 provider/model 정보(LLM 호출 없음).

**대화 관리 엔드포인트(인증·DB 백킹)** (`chat_router.py`):
- `POST /chat/conversations`(`require_permission("chat:write")`), `GET /chat/conversations`, `GET /chat/conversations/{id}`, `GET /chat/conversations/{id}/messages`.
- `POST /chat/conversations/{id}/messages`(`require_permission("chat:write")`) — 소유권 검증 → 유저 메시지 저장 → 대화 이력으로 LangChain 메시지 재구성 → SSE 스트리밍(또는 `stream=false`면 비스트리밍) → 스트림 종료 후 어시스턴트 메시지 DB 저장 → 첫 턴이면 `_auto_title`로 제목 자동 생성. 데이터 모델은 `chat_models.py`의 `Conversation`/`Message`(`finish_reason`, `token_count`).

```
POST /chat/stream: ChatRequest → LangChain 메시지 → ChatService.stream → AbstractLLMPort.stream
  → SSE data 청크들 → "[DONE]"
POST /conversations/{id}/messages: 소유권 확인 → 유저메시지 저장 → 이력 재구성 → 스트림
  → 청크 누적 → (finally) 어시스턴트 메시지 저장 + 첫 턴이면 자동 제목
```

### 1.8 영속성 / 마이그레이션

- SQLAlchemy async + asyncpg(앱), psycopg2 sync(Alembic). 단일 선언적 `Base`(`core/database.py`)에 모든 도메인 모델이 모임.
- Alembic: `api/alembic.ini`, `api/alembic/env.py`(`src`를 sys.path에 추가, `.env` 로드, `DATABASE_URL_SYNC` 사용), 마이그레이션은 `api/alembic/versions/`(현재 `0001_initial_schema.py`).
- Redis 용도: JWT 블랙리스트, OAuth state nonce, rate limiting(`core/redis.py` 주석 기준).

---

## 2. Web 프론트엔드 (`web/`)

> **실재 상태 주의**: `web/`는 초기 스캐폴딩 단계다. 자동 생성된 API 클라이언트(`web/src/api/`)는 이 StoryWeaver FastAPI 백엔드가 아니라 **다른 helpdesk(Spring 스타일) openapi 샘플**에서 생성됐다(boards/posts/comments/samples 오퍼레이션, `ApiResponse*` 래퍼 타입). `web/src/features/helpdesk/`·`web/src/sample/`도 템플릿 잔재이며, auth feature는 실제 백엔드 대신 mock(`features/auth/lib/mock-auth-api.ts`)을 호출한다. 실제 활성 라우트는 `/`, `/auth/login`, `/auth/signup` 셋뿐이다.

### 2.1 진입점과 프로바이더

- 진입점 `web/src/main.tsx` — 폰트/글로벌 CSS/i18n import 후 `RouterProvider`(`@/lib/router`의 router)를 `StrictMode`로 렌더.
- `web/src/lib/router.ts` — `createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })`. `routeTree`는 자동 생성 `web/src/routeTree.gen.ts`.
- `web/src/routes/__root.tsx` — 루트 라우트. `AppProviders`로 감싸고 `ThemeToggle`/`<Outlet/>`/`Modals`/`Toaster`/`HdToastHost`/(dev)`TanStackRouterDevtools` 배치. 샘플 경로(`isSamplePath`)면 테마 토글 숨김.
- `web/src/providers/app-providers.tsx` — `QueryClientProvider`(TanStack Query). `@/lib/api-interceptors`를 import해 axios 인터셉터 등록. QueryClient는 `mutations.retry: false`.

```
main.tsx → RouterProvider(router) → __root.tsx(AppProviders=QueryClientProvider) → <Outlet/>
```

### 2.2 라우팅 (TanStack Router, file-based)

- `web/vite.config.ts`의 `tanstackRouter` 플러그인: `routesDirectory: 'src/routes'`, `generatedRouteTree: 'src/routeTree.gen.ts'`, `autoCodeSplitting: true`.
- 라우트 파일은 `web/src/routes/`에 `createFileRoute('/path')({ component })` 형식. 현재: `index.tsx`(`/`), `auth/login.tsx`(`/auth/login`), `auth/signup.tsx`(`/auth/signup`). 각 라우트는 `features/auth/components/`의 화면을 래핑.
- 라우트 컴포넌트는 `useNavigate`로 이동(`login.tsx`의 `onSuccess`).

### 2.3 상태 관리

- **서버 상태**: TanStack Query. 단일 `QueryClient`(`app-providers.tsx`). 도메인 훅은 `useQuery`/`useMutation` 사용(예: `features/helpdesk/hooks/use-posts.ts` — 단, helpdesk는 템플릿). 생성된 `web/src/api/@tanstack/react-query.gen.ts`가 `*Mutation`/`queryOptions` 헬퍼 제공(이 또한 helpdesk openapi 기준).
- **클라이언트 상태**: Zustand.
  - `web/src/features/auth/store/auth.store.ts` — `useAuthStore`(isAuthenticated/user/token/refreshToken). 토큰은 **인메모리 전용**(localStorage 미저장, XSS 방지 주석). `setTokens`가 JWT를 디코드해 user 구성.
  - `web/src/stores/modal-store.ts` — `useModal`(zustand + `devtools` 미들웨어). 모달 스택 관리(openModal/closeModal/...).
  - `web/src/features/helpdesk/store/board.store.ts` — 템플릿.

### 2.4 API 클라이언트 레이어

- 생성 도구: `@hey-api/openapi-ts`(`web/openapi-ts.config.ts`). input `./docs/openapi.json`(저장소 web 루트에는 없음 — 외부/이전 생성물), output `./src/api`. 플러그인: `@hey-api/client-axios`(runtimeConfigPath `./src/lib/api-client`), `@hey-api/typescript`, `@hey-api/sdk`, `@tanstack/react-query`. operationId는 patch로 제거(메서드+경로 기반 함수명 생성).
- 생성 산출물(`web/src/api/`): `client.gen.ts`(axios client 인스턴스), `sdk.gen.ts`(엔드포인트 함수들), `types.gen.ts`(DTO 타입), `index.ts`(재export), `@tanstack/react-query.gen.ts`, `core/`·`client/` 런타임. **이 산출물들은 helpdesk/Spring openapi 기반이라 실제 FastAPI 엔드포인트와 불일치**한다.
- 런타임 설정: `web/src/lib/api-client.ts` — `createClientConfig`가 `baseURL`을 `import.meta.env.VITE_API_BASE_URL ?? '/api'`로 설정.
- 인터셉터: `web/src/lib/api-interceptors.ts` — axios 요청 인터셉터로 `useAuthStore`의 token을 `Authorization: Bearer` 주입. 401 토큰 갱신 인터셉터는 미구현(주석에 "Phase 3").
- dev 프록시: `web/vite.config.ts`의 server.proxy가 `/api` → `http://localhost:8080`(rewrite로 `/api` 제거). (참고: API는 `/api/v1` prefix를 사용하므로 이 프록시 타깃/포트는 현재 백엔드 기본값과 정합하지 않을 수 있다.)

```
컴포넌트 → TanStack Query 훅 → sdk.gen 함수 → axios client(client.gen)
  → 요청 인터셉터(Bearer 주입) → baseURL(/api 또는 VITE_API_BASE_URL) → (dev) Vite 프록시
```

### 2.5 UI / 빌드 도구

- UI: shadcn 스타일 컴포넌트(`web/src/components/ui/`), `components.json`(style `base-nova`, lucide 아이콘), Tailwind v4(`@tailwindcss/vite`), Radix/base-ui, `motion`, `sonner`(toast).
- 빌드: Vite 6, React 19. `tsconfig.json` strict + `@/*` → `src/*` 경로 별칭(`vite-tsconfig-paths`). `src/api`는 tsconfig include에서 제외.
- 린트/포맷: Biome(`web/biome.json`).
- 패키지 매니저: pnpm(`pnpm-workspace.yaml`, `packageManager: pnpm@10.28.2`). i18n: i18next/react-i18next(`web/src/sample/i18n/`).

---

## 3. 운영/툴링 (요약)

- API: uv(패키지), `task`/`just`(`api/Taskfile.yml`, `api/Justfile`)로 dev/test/lint/migrate. ruff + mypy(strict) + pytest. Docker(`api/Dockerfile`, `api/docker-compose.yml`/`.prod.yml`)로 Postgres/Redis/Mailpit 제공.
- 테스트: `api/tests/`(auth/chat/infra/shared + conftest). 프론트는 별도 테스트 디렉토리 없음.
