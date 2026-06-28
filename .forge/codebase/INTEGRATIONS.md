---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-26
---

# 외부 연동 (INTEGRATIONS)

프론트엔드 web ↔ 백엔드 api, 그리고 백엔드가 의존하는 외부 시스템(DB·Redis·OAuth·메일·LLM)의 배선 상태를 기록한다. "계획됨-미배선" 항목은 명시한다.

---

## 1. web ↔ api 경계

### 1.1. Vite dev 프록시 `/api`

`web/vite.config.ts`의 dev 서버(포트 3000)는 `/api` 요청을 백엔드로 프록시한다.

- target: `http://localhost:8080`
- `changeOrigin: true`
- `rewrite: (path) => path.replace(/^\/api/, '')` — `/api` 접두를 제거하고 전달.

주의(불일치): 프록시 타깃은 `:8080`이나 `api/README.md`의 dev 기본 포트는 `:8000`이다(루트 `CLAUDE.md`도 동일 경고). 또한 백엔드 라우터는 `/api/v1` 접두로 등록되는데(`api/src/main.py` `include_router(..., prefix="/api/v1")`) Vite rewrite가 `/api`를 떼므로, 풀스택 구동 시 포트와 경로 접두를 직접 맞춰야 한다. [High]

### 1.2. API 클라이언트 런타임 설정

생성 SDK는 axios 클라이언트를 쓴다. baseURL은 `web/src/lib/api-client.ts`에서 주입.

- `baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'` — 환경변수 미설정 시 dev 프록시 `/api`로 폴백.
- 인터셉터 `web/src/lib/api-interceptors.ts` — 요청 인터셉터가 **현재는 통과만** 한다(토큰 주입 없음). 주석상 실제 세션/토큰·401 갱신은 Phase 3 예정. **인증 토큰 배선 미완.** [High]

### 1.3. web에서 쓰는 환경변수

`import.meta.env` 사용처(생성 코드 제외): `VITE_API_BASE_URL`(api-client), `import.meta.env.DEV`(`web/src/routes/__root.tsx`의 router devtools, `web/src/components/dev/form-devtool.tsx`의 RHF devtool 게이트). 그 외 외부 서비스용 클라이언트 측 키는 발견되지 않음.

---

## 2. OpenAPI 코드젠 파이프라인 (`docs/openapi.json` → `src/api`)

`@hey-api/openapi-ts` `0.98.1` 기반. 설정 `web/openapi-ts.config.ts`.

- **input**: `./docs/openapi.json` (web 디렉터리 기준 → `web/docs/openapi.json`)
- **output path**: `./src/api`
- parser patch: 모든 operation의 `operationId`를 `undefined`로 제거.
- plugins: `@hey-api/client-axios`(runtimeConfigPath `./src/lib/api-client`, `baseUrl: false`), `@hey-api/typescript`, `@hey-api/sdk`, `@tanstack/react-query`.
- 실행: `pnpm generate` (= `openapi-ts`).

생성물 `web/src/api/`: `client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`, `index.ts`, `@tanstack/`(Query 훅), `client/`, `core/`. tsconfig·biome 모두 `src/api` 제외(편집 금지 생성물).

**중요 — input 스펙 누락**: `web/docs/openapi.json`(및 저장소 어디에도 `openapi.json`)이 존재하지 않으며 git에도 추적되지 않는다. 생성된 `web/src/api/`만 커밋돼 있다. 즉 현재 상태로는 `pnpm generate`를 재실행할 수 없다(스펙을 백엔드에서 추출/배치하는 단계가 빠져 있음). 루트 `CLAUDE.md`는 경로를 `docs/openapi.json`으로 기술하나 config의 상대경로는 `web/docs/openapi.json`을 가리킨다. [High]

---

## 3. 백엔드 외부 시스템

설정 단일 출처 `api/src/core/config.py`. 키 목록은 `api/.env.example`. 비밀값은 `.env`(로컬)·`.env.prod`(운영)에서 주입.

### 3.1. PostgreSQL

- 드라이버: 비동기 `asyncpg`(앱 런타임), 동기 `psycopg2`(Alembic 마이그레이션). SQLAlchemy async ORM.
- 환경변수: `DATABASE_URL`(async), `DATABASE_URL_SYNC`(Alembic). 모듈 `api/src/core/database.py`, 마이그레이션 `api/alembic/`.

### 3.2. Redis

- `redis[hiredis]`. 용도(pyproject 주석): JWT 블랙리스트, rate-limit(slowapi), OAuth state, SSE fanout.
- 환경변수: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_URL`. 모듈 `api/src/core/redis.py`.

### 3.3. 인증 — JWT + OAuth (auth 도메인)

`api/src/domains/auth/`. JWT(python-jose, HS256/RS256) + argon2 + RBAC.

- JWT 환경변수: `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS`.
- **OAuth 프로바이더 3종** — `api/src/domains/auth/oauth/`에 `google.py`·`kakao.py`·`naver.py` 어댑터. httpx로 authorize/token/userinfo 호출(예: Google `accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token`, `googleapis.com/oauth2/v3/userinfo`).
- OAuth 환경변수: `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `KAKAO_CLIENT_ID/SECRET/REDIRECT_URI`, `NAVER_CLIENT_ID/SECRET/REDIRECT_URI`.
- 라우터: `auth_router`가 `/api/v1` 접두로 등록(`api/src/main.py`).

web 쪽 인증은 현재 목업(토큰 인터셉터 미배선, 1.2 참조) — 백엔드 OAuth/JWT와 프론트엔드 연결은 미완. [High]

### 3.4. 이메일 (SMTP)

- `fastapi-mail`. dev=mailpit, prod=SMTP via env.
- 환경변수: `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_STARTTLS`, `MAIL_SSL_TLS`.

### 3.5. CORS

- `CORSMiddleware`가 `settings.cors_origins_list`로 등록(`api/src/main.py`). 환경변수 `CORS_ORIGINS`.

---

## 4. LLM 프로바이더 (chat 도메인)

LangChain + LiteLLM 추상화로 프로바이더를 교체식으로 라우팅. 단일 출처 어댑터 `api/src/infra/llm/provider_factory.py`(`make_chat_litellm` — 앱에서 `ChatLiteLLM()`을 생성하는 유일한 지점). 설정 `LLMSettings`(`api/src/core/config.py`).

- **프로바이더 전환은 `LLM_PROVIDER` 환경변수만 바꾸면 됨** (코드 변경 불필요).
- 지원 프로바이더(`LLMProvider` enum): `openai`, `anthropic`, `gemini`(Google), `azure`(Azure OpenAI), `ollama`(로컬).
- LLM 환경변수: `LLM_PROVIDER`, `LLM_DEFAULT_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `LLM_STREAMING`. 프로바이더별 자격증명(alias, `LLM_` 미접두): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AZURE_OPENAI_API_KEY`(+ azure deployment/base/version), ollama는 `api_base`(`OLLAMA_BASE_URL`) + sentinel key.
- 재시도: `tenacity`. 도메인 경계: chat 도메인은 포트/인터페이스(`LLMClientProtocol`)에만 의존, `langchain_litellm` 직접 의존은 infra 어댑터에 격리.

### 4.1. chat 엔드포인트 + SSE 스트리밍

라우터 `api/src/domains/chat/router/chat_router.py`, `chat_router`가 `/api/v1` 접두로 등록. 접두 `/chat`, tags `["chat"]`.

- `POST /chat/complete` — 단발 완성.
- `POST /chat/stream` — SSE 스트리밍(`sse-starlette`의 `EventSourceResponse`, 토큰 청크당 `data` 이벤트).
- `GET /chat/provider` — 활성 프로바이더 조회.
- 메시지 전송(SSE 스트리밍 + DB 영속) 엔드포인트 등 추가 라우트 존재.

---

## 5. 이미지 생성 — 계획됨, 미배선

`docs/image-generation.md`에 따르면 이미지 생성은 **v2+ 범위로 미루어진 부가 기능이며 MVP 비범위**다. 문서 자체가 "구현 결정이 아닌 사전 검토"이고 다수 항목이 "미결정"으로 표기됨. 후보 해법(IP-Adapter/LoRA, 시드 고정, 상용 이미지 API 캐릭터 참조)만 검토 단계. **현재 코드베이스에 이미지 생성 프로바이더/클라이언트 배선 없음.** [High]

---

## 6. 헬스체크·관측성

- `health_router`가 prefix 없이 등록(`api/src/main.py`).
- `CorrelationIdMiddleware` + `structlog` JSON 로깅(correlation_id). `api/src/core/middleware.py`, `api/src/core/logging.py`.
- rate limiting: `slowapi`(Redis 기반).

웹훅(외부 → 시스템)은 발견되지 않음. OAuth 콜백(`*_REDIRECT_URI`)은 표준 redirect 플로우이며 일반적 의미의 webhook 수신 엔드포인트가 아니다. [Medium]
