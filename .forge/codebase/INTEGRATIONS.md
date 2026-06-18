---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# INTEGRATIONS

api 백엔드가 연동하는 외부 시스템(PostgreSQL, Redis, LLM 프로바이더, OAuth, SMTP)과 web↔api 연동을 기록한다. 모든 자격증명은 환경변수로 주입되며 중앙 설정은 `api/src/core/config.py`(`Settings`)에 모인다.

---

## PostgreSQL

- 로컬 인프라: `api/docker-compose.yml`의 `postgres` 서비스 — 이미지 `postgres:16-alpine`, 호스트 `127.0.0.1:${POSTGRES_PORT:-5432}`, 볼륨 `postgres_data`, healthcheck `pg_isready`.
- 연결: `api/src/core/database.py`가 async 엔진 생성. DSN은 `Settings.async_database_url`(`postgresql+asyncpg://`) — `DATABASE_URL` 환경변수가 있으면 사용, 없으면 `POSTGRES_HOST/PORT/USER/PASSWORD/DB`로 조립.
- 환경변수: `DATABASE_URL`, `DATABASE_URL_SYNC`, `POSTGRES_HOST`(기본 localhost), `POSTGRES_PORT`(5432), `POSTGRES_USER`(app), `POSTGRES_PASSWORD`(app), `POSTGRES_DB`(app_db).
- 마이그레이션: Alembic이 sync DSN(`Settings.sync_database_url`, `postgresql+psycopg2://`) 사용. `api/alembic/env.py`가 `DATABASE_URL_SYNC` 환경변수를 우선 읽고, 없으면 `Settings`로 폴백. `target_metadata`는 `core.database.Base.metadata`이며 auth/chat 모델 모듈을 import해 등록.

## Redis

- 로컬 인프라: `api/docker-compose.yml`의 `redis` 서비스 — 이미지 `redis:7-alpine`, `redis-server --save 60 1`, 호스트 `127.0.0.1:${REDIS_PORT:-6379}`, 볼륨 `redis_data`. 컨테이너 내부는 `redis://redis:6379`, 호스트 실행 앱은 `.env`(localhost).
- 연결: `api/src/core/redis.py`가 `redis.asyncio` 단일 클라이언트(`from_url`, decode_responses=True, max_connections=20). DSN은 `Settings.redis_dsn`(`REDIS_URL` 또는 `REDIS_HOST/PORT/DB`로 조립).
- 시작 시 `api/src/main.py` lifespan에서 `ping()`으로 풀 워밍.
- 용도(`api/src/core/redis.py` 주석 기준): JWT 블랙리스트(`jti`), refresh 토큰 재사용 탐지, OAuth state nonce(짧은 TTL, `auth_router.py`의 `_OAUTH_STATE_PREFIX = "oauth:state:"`), 레이트리밋(slowapi), 일반 캐시, SSE fan-out pub/sub.
- 환경변수: `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`(6379), `REDIS_DB`(0).

## LLM 프로바이더 (LiteLLM 라우팅)

- 추상화: LangChain + langchain-litellm. `ChatLiteLLM` 인스턴스 생성 단일 지점은 `api/src/infra/llm/provider_factory.py`의 `make_chat_litellm()`. 모델 문자열 라우팅 팩토리는 `api/src/domains/chat/llm_factory.py`(`ProviderFactory`).
- 프로바이더 선택: `LLM_PROVIDER` 환경변수 하나로 전환(`LLMProvider` enum). 지원: `openai`, `anthropic`, `gemini`, `azure`, `ollama`(`api/src/core/config.py`). 모델 식별자 형식 `<provider>/<model>`(예: `openai/gpt-4o-mini`, `anthropic/claude-3-5-sonnet-20241022`, `gemini/<model>`). Azure는 `azure/<deployment>`, Ollama는 `api_base` 사용.
- 자격증명/엔드포인트 환경변수(활성 프로바이더만 필요):
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GEMINI_API_KEY`
  - `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`(기본 `2024-08-01-preview`)
  - `OLLAMA_BASE_URL`(기본 `http://localhost:11434`, API 키 불필요 — litellm sentinel `"ollama"`)
- 생성 파라미터 환경변수: `LLM_DEFAULT_MODEL`(기본 `gpt-4o-mini`), `LLM_TEMPERATURE`(0.0–2.0, 기본 0.7), `LLM_MAX_TOKENS`(기본 2048), `LLM_STREAMING`(기본 true).
- chat 도메인은 포트/인터페이스(`api/src/domains/chat/ports.py`)에만 의존하고 litellm을 직접 import하지 않음. 재시도는 tenacity.

## SSE 스트리밍

- LLM 토큰 스트리밍은 `sse-starlette`의 `EventSourceResponse`로 노출(`api/src/domains/chat/router/chat_router.py` — 라우터 prefix `/chat`, 스트리밍 POST/GET 엔드포인트). 클라이언트 측에서 SSE 소비.

## OAuth 프로바이더

각 어댑터는 `httpx.AsyncClient`로 인가코드 → 토큰 교환 → userinfo 조회를 수행하며 CSRF용 `state` nonce(`secrets.token_urlsafe(32)`)를 생성한다. 라우트는 `GET /api/v1/auth/oauth/{provider}/login`, `GET /api/v1/auth/oauth/{provider}/callback`(`api/src/domains/auth/router/auth_router.py`, `_get_oauth_adapter`로 분기).

- **Google** (`api/src/domains/auth/oauth/google.py`)
  - auth `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, userinfo `https://www.googleapis.com/oauth2/v3/userinfo`. scope `openid email profile`, `access_type=offline`, `prompt=consent`.
  - 환경변수: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Kakao** (`api/src/domains/auth/oauth/kakao.py`)
  - auth `https://kauth.kakao.com/oauth/authorize`, token `https://kauth.kakao.com/oauth/token`, userinfo `https://kapi.kakao.com/v2/user/me`.
  - 환경변수: `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`.
- **Naver** (`api/src/domains/auth/oauth/naver.py`)
  - auth `https://nid.naver.com/oauth2.0/authorize`, token `https://nid.naver.com/oauth2.0/token`, userinfo `https://openapi.naver.com/v1/nid/me`.
  - 환경변수: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI`.

## 인증 (JWT)

- python-jose 기반 JWT. 환경변수: `JWT_SECRET_KEY`, `JWT_ALGORITHM`(기본 `HS256`), `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`(15), `JWT_REFRESH_TOKEN_EXPIRE_DAYS`(7). 보안 로직 `api/src/domains/auth/security.py`. 토큰 블랙리스트/refresh 회전은 Redis 사용. 라우트: `/api/v1/auth/login`, `/refresh`, `/verify-email/{token}` 등(`auth_router.py`).

## SMTP / 메일 (Mailpit · 운영 SMTP)

- 발송: `fastapi-mail`(`api/src/domains/auth/email.py`, `FastAPIAuthEmailService`). 연결 설정은 `Settings.mail_connection_config`로 조립.
- 로컬 인프라: `api/docker-compose.yml`의 `mailpit` 서비스 — 이미지 `axllent/mailpit:latest`, SMTP `127.0.0.1:${MAILPIT_SMTP_PORT:-1025}`, Web UI `127.0.0.1:${MAILPIT_UI_PORT:-8025}`, 익명 SMTP 허용(`MP_SMTP_AUTH_ACCEPT_ANY`).
- 환경변수: `MAIL_SERVER`(기본 localhost), `MAIL_PORT`(기본 1025 = Mailpit), `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_STARTTLS`, `MAIL_SSL_TLS`. 로컬은 익명(USE_CREDENTIALS=False), 운영은 `.env.prod`로 실제 SMTP 릴레이 주입.
- 메일 내 링크는 프론트엔드 URL 사용: `FRONTEND_URL`(기본 `http://localhost:3000`, 이메일 인증), `FRONTEND_RESET_CONFIRM_URL_BASE`(비번 재설정).
- readiness 점검(`api/src/main.py` `/ready`)이 postgres/redis와 함께 Mailpit SMTP 220 배너를 직접 확인.

## web ↔ api 연동

- **OpenAPI 코드 생성**: `@hey-api/openapi-ts`가 `web/docs/openapi.json`(api의 `/openapi.json`에서 추출)을 입력으로 `web/src/api/`에 axios 클라이언트 + 타입 + SDK + TanStack Query 훅을 생성(`web/openapi-ts.config.ts`, 스크립트 `pnpm generate`). 산출물: `client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`, `@tanstack/`.
- **HTTP 클라이언트**: axios 기반(`@hey-api/client-axios`). baseURL은 `web/src/lib/api-client.ts`에서 `VITE_API_BASE_URL ?? '/api'`로 설정.
- **인증 헤더 주입**: `web/src/lib/api-interceptors.ts`의 요청 인터셉터가 `useAuthStore`(zustand)의 토큰을 `Authorization: Bearer`로 주입. (401 토큰 갱신 인터셉터는 미구현 — 코드 주석에 "Phase 3 예정".)
- **dev 프록시**: `web/vite.config.ts`가 dev 서버 `/api`를 `http://localhost:8080`으로 프록시(`/api` 프리픽스 제거). 단, api 기본 포트는 8000(`Settings.port`)이므로 프록시 타깃(8080)과 불일치 — 환경에 맞는 확인 필요.
- **TanStack Query**: `web/src/providers/app-providers.tsx`의 `QueryClientProvider`가 생성 훅 소비.

## 환경변수 · 시크릿 위치

- api: `api/.env`(로컬, 미커밋), `api/.env.example`, `api/.env.prod.example`. 중앙 설정 `api/src/core/config.py`. 시크릿 스캔 baseline `api/.secrets.baseline`, pre-commit `api/.pre-commit-config.yaml`.
- web: `VITE_*` 접두 환경변수(`VITE_API_BASE_URL`). Vite가 `import.meta.env`로 노출.
- CORS: api `CORS_ORIGINS`(기본 `http://localhost:3000`, `http://localhost:8000`) — `api/src/main.py`에서 `CORSMiddleware`로 적용(allow_credentials, expose `X-Correlation-ID`).
