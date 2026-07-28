---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# INTEGRATIONS

api(FastAPI)만 외부 경계를 가진다. web(React)은 api 하나만 호출하며, 그 외 서드파티 연동은 없다(웹훅 수신 엔드포인트·메시지 브로커·클라우드 스토리지 연동은 코드베이스 전체에서 확인되지 않음).

## 데이터베이스 — PostgreSQL + pgvector

- 이미지: `pgvector/pgvector:pg16`(`api/docker-compose.yml` postgres 서비스). `postgres_data` named volume, `127.0.0.1:${POSTGRES_PORT:-5432}`에만 바인딩.
- pgvector 확장은 `CREATE EXTENSION IF NOT EXISTS vector`로 최초 마이그레이션에서 활성화 — `api/alembic/versions/0001_initial_schema.py:29`(embeddings 테이블의 `Vector` 컬럼보다 먼저 실행되어야 함).
- 비동기 접속: `api/src/core/database.py`의 `create_async_engine(settings.async_database_url, ...)`(`asyncpg` 드라이버, pool_size=5/max_overflow=10/pool_recycle=3600). 세션은 `get_async_session()` FastAPI 의존성으로 요청당 발급.
- 동기 접속(Alembic 전용): `settings.sync_database_url`(`psycopg2` 드라이버) — `api/alembic/env.py`가 사용.
- DSN 조립: `api/src/core/config.py`의 `async_database_url`/`sync_database_url` 프로퍼티 — `DATABASE_URL`/`DATABASE_URL_SYNC`가 채워져 있으면 그대로 쓰고, 비어 있으면 `POSTGRES_HOST/PORT/USER/PASSWORD/DB`로 조립.
- `Vector` 컬럼 사용처: `api/src/domains/memory/models/memory_models.py`의 `Embedding.embedding`(`Vector(EMBEDDING_DIM)`, 384차원).

## 캐시·레이트리밋 — Redis

- 이미지: `redis:7-alpine`(`api/docker-compose.yml` redis 서비스, `--save 60 1`).
- 클라이언트: `api/src/core/redis.py`의 `get_redis_client()` — 프로세스 전역 싱글턴(`redis.asyncio.from_url`, `decode_responses=True`, `max_connections=20`). 앱 startup에서 `ping()`으로 워밍업(`api/src/main.py` lifespan).
- 실제 사용처:
  - JWT 블랙리스트·refresh-token 재사용 탐지 — `api/src/domains/auth/security.py`
  - budget 토큰 사용량 카운터(`INCRBY` + 최초 생성 시 `EXPIRE`, 30일 고정 주기) — `api/src/domains/budget/service/budget_service.py`
  - rate limiting은 `slowapi`(아래 참고) — 현재 구현은 Redis를 쓰지 않고 인메모리 저장소를 쓴다(`api/src/core/rate_limit.py` 주석: 멀티 워커 전환 시 `storage_uri=settings.redis_dsn` 필요, 아직 미적용).
- 큐/메시지 브로커 아님: `api/src/domains/shared/events.py`는 asyncio 기반 **인프로세스** 도메인 이벤트 버스(`DomainEventBus`, `publish`/`subscribe`)로, 외부 브로커로 이벤트를 내보내지 않는다(모듈 docstring이 명시적으로 배제).

## 인증 프로바이더

- **JWT**: `python-jose`로 서명/검증(`api/src/domains/auth/security.py`), 알고리즘 `JWT_ALGORITHM`(기본 HS256), 비밀값 `JWT_SECRET_KEY`. 만료: `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`/`JWT_REFRESH_TOKEN_EXPIRE_DAYS`.
- **비밀번호 해싱**: `passlib[argon2]` + `argon2-cffi`(`api/src/domains/auth/security.py`의 `CryptContext(schemes=["argon2"])`).
- **RBAC**: `require_permission(key)` FastAPI 의존성 팩토리(`api/src/domains/auth/security.py`), 역할·권한 조회는 `selectinload(User.roles).selectinload(Role.permissions))`.
- **OAuth 2.0** — `httpx.AsyncClient`로 각 프로바이더의 authorize/token/userinfo 엔드포인트 직접 호출(어댑터 패턴, SDK 미사용):
  | 프로바이더 | 어댑터 | Authorize URL | Token URL | Userinfo URL |
  |---|---|---|---|---|
  | Google | `api/src/domains/auth/oauth/google.py` | `accounts.google.com/o/oauth2/v2/auth` | `oauth2.googleapis.com/token` | `www.googleapis.com/oauth2/v3/userinfo` |
  | Kakao | `api/src/domains/auth/oauth/kakao.py` | `kauth.kakao.com/oauth/authorize` | `kauth.kakao.com/oauth/token` | `kapi.kakao.com/v2/user/me` |
  | Naver | `api/src/domains/auth/oauth/naver.py` | `nid.naver.com/oauth2.0/authorize` | `nid.naver.com/oauth2.0/token` | `openapi.naver.com/v1/nid/me` |

  각 어댑터는 `{PROVIDER}_CLIENT_ID`/`{PROVIDER}_CLIENT_SECRET`/`{PROVIDER}_REDIRECT_URI` 환경변수로 구성되며(`api/src/core/config.py`), CSRF 방지용 `state` nonce를 생성한다. 라우트 등록은 `api/src/domains/auth/router/auth_router.py`.
- **web 쪽 배선**: 액세스/리프레시 토큰은 Zustand `persist` 미들웨어로 로컬스토리지에 저장(`web/src/features/auth/store/auth.store.ts`, 키 `sw-auth-v3`). axios 인터셉터(`web/src/lib/api-interceptors.ts`)가 요청에 `Authorization: Bearer` 헤더를 주입하고, 401 응답 시 단일-비행(single-flight) refresh 후 원요청을 재시도한다. SSE 같은 raw fetch 경로(`assist.api.ts`)는 동일 refresh 코디네이터(`refreshAccessToken()`)를 재사용해 401을 직접 처리.

## LLM 프로바이더와 라우팅

- **라이브러리 체인**: `langchain` + `langchain-litellm`(`ChatLiteLLM`) + `litellm`(실제 프로바이더 라우팅). 단일 조립 지점은 `api/src/infra/llm/provider_factory.py`의 `make_chat_litellm()` — 테스트는 이 모듈의 `ChatLiteLLM`을 패치해 네트워크 호출을 가로챈다.
- **지원 프로바이더**(`api/src/core/config.py`의 `LLMProvider` enum): `openai` · `anthropic` · `gemini` · `azure` · `ollama` · `openai_compatible`(커스텀 OpenAI 호환 엔드포인트, 예: z.ai/GLM). 활성 프로바이더는 `LLM_PROVIDER` 환경변수 하나로 전환(모델 문자열 포맷 `<provider>/<model>`).
- **프로바이더별 자격증명 환경변수**: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `AZURE_OPENAI_API_KEY`+`AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_DEPLOYMENT`+`AZURE_OPENAI_API_VERSION` / `OLLAMA_BASE_URL`(키 불필요) / `OPENAI_COMPATIBLE_BASE_URL`+`OPENAI_COMPATIBLE_API_KEY`.
- **모델 문자열 라우팅 로직**: `api/src/domains/chat/llm_factory.py`의 `ProviderFactory`(Azure는 배포명 우선, openai_compatible은 `openai/<model>`로 매핑).
- **호출 계층**: `api/src/domains/chat/llm_client.py`의 `LLMClient`(`ainvoke`/`astream`)가 `ChatLiteLLM`을 감싸고, 성공/실패 모두 `_record_call()`로 비동기 fire-and-forget 로깅.
- **LLM 호출 로그**: `api/src/domains/chat/models/llm_call_log.py`(`llm_call_logs` 테이블) — correlation_id, user_id, task, model, provider, 메시지(OpenAI 포맷 변환), 응답, 에러, latency_ms, prompt/completion 토큰. 저장은 `api/src/domains/chat/repository/llm_call_log_repository.py`의 `save_llm_call_log()`(자체적으로 예외를 삼켜 실제 LLM 호출을 절대 막지 않음).
- **SSE 스트리밍 엔드포인트**: `api/src/domains/chat/router/chat_router.py`(`/api/v1/chat/complete`, `/api/v1/chat/stream`, `/api/v1/works/{work_id}/chat/...`)와 `api/src/domains/assist/router/assist_router.py`(이어쓰기·인필링·대사변환·문체변환·교정·제목) 모두 `sse_starlette.EventSourceResponse` 사용.
- **모더레이션(전체이용가 가드)**: 외부 모더레이션 API 없음 — 키워드 매칭 기반 선제 가드(S1) + 완곡 거절 시 시스템 프롬프트 완화 재시도 1회(S2), `api/src/domains/moderation/service/moderation_service.py`. 인증/연결/레이트리밋/서버 오류 등 litellm의 운영성 예외(`_OPERATIONAL_LLM_ERRORS`)는 콘텐츠 거절로 위장하지 않고 `LLMUnavailableError`(502)로 표면화.
- **rate limiting**: `slowapi`(`api/src/core/rate_limit.py`) — 인증 사용자 ID 또는 IP 기준, `key_style="endpoint"`, 기본 `LLM_RATE_LIMIT = "10/minute"`. 현재 저장소는 인메모리(단일 워커 전제).
- **budget(토큰 사용량 상한)**: `api/src/domains/budget/service/budget_service.py`(Redis 카운터) + `api/src/domains/budget/dependency.py`(FastAPI 의존성 게이트). 정확한 요금제별 한도는 미결정 — `BUDGET_TOKEN_LIMIT` 환경변수(기본 100,000)로 구조만 동작.

## 임베딩 — 로컬 모델(외부 API 아님)

- `sentence-transformers`로 `paraphrase-multilingual-MiniLM-L12-v2`(384차원)를 **로컬 실행** — `api/src/domains/memory/embedding_client.py`. LLM_PROVIDER와 무관한 별도 클라이언트(주석: z.ai 등 현재 LLM 프로바이더가 임베딩 엔드포인트를 지원하지 않아 분리).
- 모델은 프로세스당 1회 로드(더블체크 락킹), 앱 startup 시 별도 데몬 스레드에서 백그라운드 워밍업(`api/src/main.py` lifespan — `asyncio.to_thread` 대신 순수 스레드를 쓰는 이유가 주석에 명시: uvicorn reload/shutdown이 executor 종료를 기다리며 블로킹되는 것을 피하기 위함).
- 저장: `api/src/domains/memory/models/memory_models.py`의 `Embedding`(pgvector `Vector(384)` 컬럼). 인덱싱 로직은 `api/src/domains/memory/service/memory_service.py`, 검색은 `api/src/domains/memory/service/memory_search_service.py`.

## 메일

- 라이브러리: `fastapi-mail`. 연결 설정 조립은 `api/src/core/config.py`의 `Settings.mail_connection_config`(→ `ConnectionConfig(**kwargs)`).
- dev: Mailpit 컨테이너(`api/docker-compose.yml`, `axllent/mailpit`) — SMTP `MAILPIT_SMTP_PORT`(기본 1025), 웹 UI `MAILPIT_UI_PORT`(기본 8025), 데이터는 SQLite로 영속화. `MAIL_SERVER=localhost`, `MAIL_STARTTLS=false`, `MAIL_SSL_TLS=false`로 로컬 SMTP에 무인증 연결.
- prod: `MAIL_SERVER`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD`/`MAIL_STARTTLS`/`MAIL_SSL_TLS` 환경변수로 실제 SMTP 릴레이 교체(`api/.env.prod.example`, `api/docker-compose.prod.yml` app 서비스).
- 발신 로직(가입 인증·비밀번호 재설정 이메일): `api/src/domains/auth/email.py`. 재설정 링크 베이스는 `FRONTEND_RESET_CONFIRM_URL_BASE`.

## 이미지 생성 — 부분 구현(외부 API 미배선)

- `api/src/domains/image_generation/service/image_generation_service.py`: 엔티티 카드 필드(인물의 `appearance`, 장소의 `description`/`atmosphere`/`region`)를 프롬프트 문자열로 변환(S1)하고, `moderation` 도메인의 키워드 가드를 재사용해 정책 필터링(S2)까지만 구현.
- 실제 상용 이미지 생성 API 호출(S3)은 모듈 docstring에 "후속 작업"으로 명시되어 있으며, 코드베이스에 어댑터·API 키·라우터가 없다. `api/src/main.py`의 라우터 등록 목록에도 image_generation은 없음(FastAPI에 노출되지 않음).

## 스토리지·파일 처리

- 외부 오브젝트 스토리지(S3 등) 연동 없음.
- 파일 관련 유일한 처리는 `api/src/domains/manuscript/service/export_service.py`의 `zipfile.ZipFile` — 원고를 인메모리 ZIP으로 묶어 응답으로 직접 스트리밍(별도 저장소에 쓰지 않음).
- 파일 업로드 엔드포인트(`UploadFile`) 없음. `python-multipart`는 FastAPI 폼 처리 요구사항으로만 설치돼 있음.

## SSE(웹 스트리밍) — web 쪽 배선

- 생성 SDK(`web/src/api/core/serverSentEvents.gen.ts`, hey-api `@tanstack/react-query` 플러그인 산출물)가 SSE 지원 코드를 생성하지만, 실제 기능 코드에서는 **채택되지 않고** 수동 파싱으로 대체한다.
- `web/src/features/editor/api/assist.api.ts`와 `web/src/features/memory/api/chat.api.ts`가 동일한 패턴을 각각 구현: `fetch()` → `ReadableStream<Uint8Array>` → `toTextChunks()`(디코딩) → `parseSseTextStream()`(`data:`/`event: error`/`[DONE]` sentinel 수동 파싱). axios 인터셉터를 우회하므로 401은 `refreshAccessToken()`(`web/src/lib/api-interceptors.ts`)으로 직접 단일-비행 재시도한다.
- `web/src/features/chat/api/chat.api.ts`는 non-streaming JSON 경로만 생성 SDK로 감싸고, SSE 엔드포인트(`postApiV1ChatStream`, `stream: true` 메시지 전송)는 의도적으로 감싸지 않는다(주석 명시).
- 와이어 포맷: 서버(`sse_starlette.EventSourceResponse`)가 청크당 `data: <chunk>\r\n\r\n`, 종료 시 `data: [DONE]\r\n\r\n`, 실패 시 `event: error\r\ndata: <message>\r\n\r\n`.

## 웹훅

- 수신·발신 웹훅 엔드포인트 없음(OAuth 콜백은 있으나 이는 프론트엔드 리다이렉트 콜백이지 서드파티발 웹훅이 아님).

## CORS·프록시

- CORS: `CORSMiddleware`(`api/src/main.py`), 허용 origin은 `CORS_ORIGINS`(JSON 배열 또는 콤마구분 문자열, `api/src/core/config.py`의 `cors_origins_list`).
- dev 프록시: `web/vite.config.ts` — `/api` → `http://localhost:8000`(rewrite 없음, 백엔드가 `/api/v1` 접두로 서빙하므로 그대로 전달).

## 관측성

- 구조화 로깅: `structlog`(`api/src/core/logging.py`) — dev는 콘솔 컬러 렌더러, prod는 JSON. `httpx`/`httpcore`/`openai`/`litellm`/`sqlalchemy.engine`/`uvicorn.access` 로거는 WARNING으로 억제(LLM 호출 원시 덤프 노이즈 방지 — 대신 `llm_client.py`가 프롬프트/응답을 별도로 로깅).
- 상관관계 ID: `CorrelationIdMiddleware`(`api/src/core/middleware.py`) — `X-Correlation-ID` 헤더를 읽거나 생성해 structlog contextvars에 바인딩, 응답 헤더로도 반환.
- 외부 APM/에러 트래킹(Sentry 등) 연동 없음.
