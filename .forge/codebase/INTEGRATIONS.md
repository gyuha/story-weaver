---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# INTEGRATIONS

외부 경계는 **api(FastAPI)만** 가진다. web(React)은 api 하나만 호출하며 그 외 서드파티 연동이 없다. 코드베이스 전체에 수신·발신 웹훅 엔드포인트, 메시지 브로커, 오브젝트 스토리지, 외부 APM·에러 트래킹 연동은 존재하지 않는다.

api가 실제로 말을 거는 외부 시스템은 다섯 갈래다: PostgreSQL(+pgvector) · Redis · OAuth 3사(google·kakao·naver) · LLM 프로바이더(litellm 경유) · SMTP(dev=Mailpit). 임베딩 모델은 외부 API가 아니라 프로세스 내 로컬 실행이다.

## 데이터베이스 — PostgreSQL + pgvector

- 이미지 `pgvector/pgvector:pg16`(`api/docker-compose.yml` postgres 서비스). `postgres_data` named volume, 포트는 `127.0.0.1:${POSTGRES_PORT:-5432}`에만 바인딩, `pg_isready` 헬스체크.
- pgvector 확장은 `op.execute("CREATE EXTENSION IF NOT EXISTS vector")`로 최초 마이그레이션에서 활성화된다 — `api/alembic/versions/0001_initial_schema.py:29`. `embeddings.embedding`(`Vector(384)`) 컬럼 생성보다 먼저 실행돼야 한다.
- 비동기 접속: `api/src/core/database.py`의 `create_async_engine(settings.async_database_url, ...)` — asyncpg 드라이버, `pool_pre_ping=True`, `pool_size=5`, `max_overflow=10`, `pool_recycle=3600`, `echo=APP_DEBUG`. 세션은 `async_sessionmaker(expire_on_commit=False, autoflush=False)` + `get_async_session()` FastAPI 의존성으로 요청당 발급.
- 동기 접속(Alembic 전용): `settings.sync_database_url`(psycopg2). `api/alembic/env.py`가 `prepend_sys_path = . src`로 `src`를 넣고 `core.config.Settings`에서 DSN을 얻으며(실패 시 env 폴백), `python-dotenv`가 있으면 `.env`를 먼저 로드한다. `compare_type=True`, `target_metadata`는 도메인 모델 7묶음을 개별 import해 채운다.
- 마이그레이션 2개: `0001_initial_schema`(create_table 22회, 파일 559줄, 다운그레이드에서 enum 타입 4개 DROP), `0002_purge_empty_embeddings`(스키마 변경 없는 1회성 데이터 정리 — `DELETE FROM embeddings WHERE content = ''`).
- ORM 테이블 19개(`__tablename__` 기준): synopses·episodes·chapters·embeddings·entities·conversations·messages·llm_call_logs·permissions·roles·users·refresh_tokens·email_verifications·password_resets·oauth_accounts·update_suggestions·works·timeline_states·scene_entity_links.
- DSN 조립: `api/src/core/config.py`의 `async_database_url`/`sync_database_url` — `DATABASE_URL`/`DATABASE_URL_SYNC`가 채워져 있으면 그대로, 비어 있으면 `POSTGRES_HOST/PORT/USER/PASSWORD/DB`로 조립. prod 오버레이(`api/docker-compose.prod.yml`)는 두 DSN을 컨테이너 호스트명(`postgres`)으로 직접 주입한다.

## Redis — 4개 키 네임스페이스

- 이미지 `redis:7-alpine`(`redis-server --save 60 1 --loglevel warning`), `redis_data` volume, `127.0.0.1:${REDIS_PORT:-6379}` 바인딩.
- 클라이언트: `api/src/core/redis.py`의 `get_redis_client()` — 프로세스 전역 싱글턴(`redis.asyncio.from_url`, `decode_responses=True`, `max_connections=20`), `get_redis_dep()`로 주입. 앱 startup에서 `ping()` 워밍업, shutdown에서 `aclose()`(`api/src/main.py` lifespan).

| 키 패턴 | 용도 | 소유 파일 |
|---|---|---|
| `jwt:blacklist:<jti>` | 로그아웃된 access token 무효화(TTL = 토큰 만료까지), 매 요청 검사 | `api/src/domains/auth/security.py` |
| `oauth:state:<state>` | OAuth CSRF state nonce(짧은 TTL, 콜백에서 검증 후 `delete`) | `api/src/domains/auth/router/auth_router.py` |
| `budget:usage:<user_id>` | 주기 누적 토큰 카운터(`INCRBY` + 키가 새로 생겼을 때만 `EXPIRE`, 고정 30일) | `api/src/domains/budget/service/budget_service.py` |
| `assist:correct:<work_id>:<sha256>` | 교정 응답 SSE 청크 목록 캐시(TTL 5분, work_id로 테넌트 격리) | `api/src/domains/assist/correct_cache.py` |

- **rate limiting은 Redis를 쓰지 않는다** — `api/src/core/rate_limit.py`의 slowapi 저장소는 인메모리 기본값이다(단일 워커 전제, `Settings.workers = 1`). 멀티 워커 전환 시 `storage_uri=settings.redis_dsn`이 필요하다는 점이 모듈 docstring에 명시돼 있다.
- **refresh token 재사용 탐지는 Redis가 아니라 PostgreSQL** — `refresh_tokens` 테이블의 `family_id`(회전 체인) + `revoke_all_user_refresh_tokens()`로 처리하고, 재사용 감지 시 `refresh_token_reuse_detected`(`security_event_type="token_reuse"`) 구조화 로그를 남긴다(`api/src/domains/auth/service/auth_service.py`).
- 큐/브로커 아님: `api/src/domains/shared/events.py`는 asyncio 기반 **인프로세스** 도메인 이벤트 버스로, 외부 브로커로 내보내지 않는다.

## 인증 프로바이더

- **JWT**: `python-jose`로 서명·검증(`api/src/domains/auth/security.py`). 알고리즘 `JWT_ALGORITHM`(기본 HS256), 비밀값 `JWT_SECRET_KEY`, 만료 `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`(15)·`JWT_REFRESH_TOKEN_EXPIRE_DAYS`(7). access token은 `sub`/`jti`/`iat`/`exp`/`type` 예약 클레임을 쓰고, refresh token은 `fid`(family id)를 추가로 담는다.
- **비밀번호 해싱**: `passlib[argon2]` + `argon2-cffi` — `CryptContext(schemes=["argon2"], deprecated="auto")`.
- **RBAC**: `require_permission(key)` 의존성 팩토리. 권한 조회는 `users`–`roles`–`permissions` 3테이블 + 연결 테이블.
- **OAuth 2.0** — SDK 없이 `httpx.AsyncClient`로 각 사의 엔드포인트를 직접 호출하는 어댑터 패턴:

| 프로바이더 | 어댑터 | Authorize | Token | Userinfo |
|---|---|---|---|---|
| Google | `api/src/domains/auth/oauth/google.py` | `accounts.google.com/o/oauth2/v2/auth` | `oauth2.googleapis.com/token` | `www.googleapis.com/oauth2/v3/userinfo` |
| Kakao | `api/src/domains/auth/oauth/kakao.py` | `kauth.kakao.com/oauth/authorize` | `kauth.kakao.com/oauth/token` | `kapi.kakao.com/v2/user/me` |
| Naver | `api/src/domains/auth/oauth/naver.py` | `nid.naver.com/oauth2.0/authorize` | `nid.naver.com/oauth2.0/token` | `openapi.naver.com/v1/nid/me` |

  구성 변수는 프로바이더별 `{GOOGLE,KAKAO,NAVER}_CLIENT_ID`/`_CLIENT_SECRET`/`_REDIRECT_URI`이며 연결 계정은 `oauth_accounts` 테이블에 저장된다. 라우트 등록은 `api/src/domains/auth/router/auth_router.py`.
- **web 쪽 배선**: 토큰은 Zustand `persist`로 로컬스토리지에 저장(`web/src/features/auth/store/auth.store.ts`, 키 `sw-auth-v3`). `web/src/lib/api-interceptors.ts`가 요청에 `Authorization: Bearer`를 주입하고, 401이면 단일-비행(single-flight) refresh 코디네이터로 한 번만 갱신한 뒤 원요청을 재시도한다. refresh 자체가 401이거나 재시도한 요청이 다시 401이면 세션을 비우고 `/auth/login`으로 이동. 공개 auth 경로 4개(`login`·`signup`·`password-reset`·`verify-email`)의 오류는 refresh·리다이렉트 없이 화면으로 그대로 전파한다.

## LLM 프로바이더와 라우팅

- **체인**: `langchain-litellm`의 `ChatLiteLLM` → `litellm`이 실제 프로바이더로 라우팅. 유일한 조립 지점은 `api/src/infra/llm/provider_factory.py`의 `make_chat_litellm()`이고, 테스트는 이 모듈의 `ChatLiteLLM` 심볼을 패치해 네트워크를 차단한다.
- **지원 프로바이더**(`LLMProvider` StrEnum, `api/src/core/config.py`): `openai` · `anthropic` · `gemini` · `azure` · `ollama` · `openai_compatible`. 전환은 `LLM_PROVIDER` 하나로 하며 모델 문자열은 `<provider>/<model>`(azure는 배포명, openai_compatible은 `openai/<model>` + 커스텀 `api_base`).
- **자격증명 변수**: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `AZURE_OPENAI_API_KEY`+`AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_DEPLOYMENT`+`AZURE_OPENAI_API_VERSION` / `OLLAMA_BASE_URL`(키 불필요, litellm sentinel `"ollama"` 사용) / `OPENAI_COMPATIBLE_BASE_URL`+`OPENAI_COMPATIBLE_API_KEY`. 값은 전부 `SecretStr`로 담긴다.
- 주의: 루트 `Settings`에는 `openai_compatible_*` 필드가 없고 `settings.llm` 프로퍼티도 이 둘을 넘기지 않는다 — `LLMSettings`가 자기 env 소스에서 직접 읽는 경로로만 반영된다. `api/.env.prod.example`에도 두 변수가 없다(prod 템플릿이 이 프로바이더를 커버하지 않음).
- **모델 문자열 분기**: `LLMSettings.litellm_model` + `as_litellm_kwargs()`(azure는 `api_base`/`api_version`, ollama·openai_compatible은 `api_base` 추가). 도메인 쪽 래퍼는 `api/src/domains/chat/llm_factory.py`의 `ProviderFactory`.
- **호출 계층**: `api/src/domains/chat/llm_client.py`의 `LLMClient`(`ainvoke`/`astream`, 브리지 `invoke`/`stream`)가 `ChatLiteLLM`을 감싼다. 헥사고날 포트는 `api/src/domains/chat/ports.py`(`LLMClientProtocol`·`LLMClientFactoryProtocol` Protocol 2개 + `AbstractLLMPort` ABC)로, 도메인 서비스는 구체 클래스를 모른다.
- **품질 티어 라우팅**: `api/src/domains/assist/tier_routing.py` — 작업 종류 6개를 `low_cost`(continue·infill·correct·title) / `high_quality`(dialogue·style)로 매핑하는 `TASK_TIER` 표와 `_TIER_FACTORY_GETTERS` dict 디스패치. 실제 프로바이더가 하나뿐이라 **두 티어가 현재 같은 팩토리를 가리킨다**(두 번째 모델 배선 시 한 엔트리만 교체하는 seam). 별도로 `get_fast_writing_client()`가 표를 우회하는 빠른 경로 seam으로 존재한다.
- **호출 로그**: `llm_call_logs` 테이블(`api/src/domains/chat/models/llm_call_log.py`)에 correlation_id·user_id·task·model·provider·메시지(OpenAI 포맷 변환)·응답·에러·latency_ms·prompt/completion 토큰을 남긴다. 기록은 `LLMClient._record_call()`이 `asyncio.create_task`로 fire-and-forget하고, 저장 함수(`api/src/domains/chat/repository/llm_call_log_repository.py`의 `save_llm_call_log()`)와 준비 단계 모두 예외를 삼켜 실제 LLM 호출을 절대 막지 않는다. user_id·task는 요청 스코프 contextvar(`api/src/core/llm_call_context.py`)에서, correlation_id는 structlog contextvars에서 읽는다.
- **스트림 취소 회계**: `LLMClient.astream`이 `asyncio.CancelledError`를 잡아 이미 태운 토큰을 `error="cancelled"`로 기록한 뒤 re-raise한다. 예산 차감처럼 `await`이 필요한 쪽은 라우터에서 `anyio.CancelScope(shield=True)` 안에서 수행한다(`assist_router.py:231`, `chat_router.py:725`, `manuscript_router.py:184`) — shield를 지우면 조용히 차감이 누락되는 종류의 버그라 `api/tests/test_stream_cancel_shield.py`·`test_stream_cancel_accounting.py`가 이를 고정한다.
- **실패 분류(`moderation` 도메인)**: `api/src/domains/moderation/service/moderation_service.py`는 **콘텐츠 수위를 판정하지 않는다** — 제품이 강제하던 연령·수위 제한과 완화 재시도가 ADR `260730-070532`로 제거됐고(도메인 이름만 리네임 비용 때문에 유지) 정책 집행은 모델 제공자에 위임한다. 남은 책임은 두 갈래 분류다: 운영 실패(litellm의 `AuthenticationError`·`PermissionDeniedError`·`RateLimitError`·`ServiceUnavailableError`·`InternalServerError`·`BadGatewayError`·`APIConnectionError`·`Timeout` 8종) → `LLMUnavailableError`(502, provider raw 메시지 비노출) / 그 외 예외·빈 응답 → 제공자 거절 안내 문구. 함수명의 `_with_retry`는 재시도가 사라진 뒤에도 호출부 6곳을 안 건드리려고 남긴 이름이다.
- **활성 프로바이더 조회 엔드포인트**: `GET /api/v1/chat/provider`.

## 비용·요청 상한 게이트

- **budget 게이트**: `api/src/domains/budget/dependency.py`의 `require_budget_available`이 LLM 호출 라우트의 `dependencies=[...]`로 걸려, 주기 누적 사용량이 `BUDGET_TOKEN_LIMIT`(기본 100,000) 이상이면 429로 호출 자체를 막는다. 사용량 기록은 `record_usage()`(호출부 5개 라우터), 토큰 수는 `estimate_tokens()`의 "4자 ≈ 1토큰" 근사치 — 스트림 청크가 평문 `str`이라 usage 메타데이터가 없고 `invoke`의 `usage_metadata`도 프로바이더마다 보장되지 않기 때문이다. 요금제별 실제 한도는 미결정.
- **rate limit**: slowapi `Limiter(key_func=사용자ID→IP 폴백, key_style="endpoint", headers_enabled=True)`, 기본 `LLM_RATE_LIMIT = "10/minute"`, 429 본문을 앱 공통 `{"detail": ...}`로 감싸되 `Retry-After`는 slowapi 로직 그대로. `key_style="endpoint"`는 필수 — 기본 `"url"`이면 `work_id`/`chapter_id`가 다른 요청이 같은 버킷에 모이지 않는다.

## 임베딩 — 로컬 모델(외부 API 아님)

- `api/src/domains/memory/embedding_client.py`가 `sentence-transformers`로 `paraphrase-multilingual-MiniLM-L12-v2`(384차원, `EMBEDDING_DIM`)를 **프로세스 내에서** 실행한다. LLM 프로바이더가 임베딩 엔드포인트를 제공하지 않을 수 있어 chat 도메인과 분리된 별도 클라이언트로 두었고 API 키가 필요 없다.
- 모델은 프로세스당 1회 로드(`lru_cache`가 락 밖에서 생성자를 중복 호출할 수 있어 더블체크 락킹 직접 구현). 앱 startup에서 **plain daemon thread**로 백그라운드 워밍업한다 — `asyncio.to_thread`를 쓰면 uvicorn의 `loop.shutdown_default_executor()`가 모델 로드 완료까지 블로킹돼 reload/shutdown이 멈추기 때문(`api/src/main.py` lifespan 주석). 동기 API는 `embed_text`/`embed_texts`, 비동기는 `aembed_text`(`asyncio.to_thread`).
- 저장·검색: `Embedding` 모델(`Vector(384)`), 인덱싱 `api/src/domains/memory/service/memory_service.py`, 검색 `memory_search_service.py`.

## 메일

- 라이브러리 `fastapi-mail`. 연결 설정은 `Settings.mail_connection_config`가 조립해 `ConnectionConfig(**kwargs)`로 넘긴다 — `USE_CREDENTIALS`는 `MAIL_USERNAME`이 있을 때만 True, `VALIDATE_CERTS`는 TLS가 실제로 켜졌을 때만 True.
- dev: Mailpit 컨테이너(`axllent/mailpit:latest`) — SMTP `MAILPIT_SMTP_PORT`(1025), 웹 UI `MAILPIT_UI_PORT`(8025), `MP_SMTP_AUTH_ACCEPT_ANY=1`로 무인증 수신, `MP_DATABASE=/data/mailpit.db`로 SQLite 영속화, `/mailpit readyz` 헬스체크. 호스트에서 도는 FastAPI가 `MAIL_SERVER=localhost:1025`로 붙는다.
- prod: `MAIL_SERVER`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD`/`MAIL_STARTTLS`/`MAIL_SSL_TLS`로 실제 SMTP 릴레이 교체(`api/docker-compose.prod.yml`이 기본값 `smtp.storyweaver.local:587`+STARTTLS 주입, mailpit은 `dev-tools` 프로파일로 제외).
- 발송 로직(가입 인증·비밀번호 재설정): `api/src/domains/auth/email.py`. 재설정 링크 베이스는 `FRONTEND_RESET_CONFIRM_URL_BASE`(뒤 슬래시를 validator가 제거).
- `/ready` 엔드포인트가 postgres·redis와 함께 SMTP 220 배너까지 실제로 확인한다(`api/src/main.py`).

## 이미지 생성 — 프롬프트 변환까지만

- `api/src/domains/image_generation/service/image_generation_service.py`는 엔티티 카드 attributes를 프롬프트 문자열로 매핑하는 순수 함수 2개(`map_character_to_prompt`는 `appearance`만, `map_location_to_prompt`는 `description`+`atmosphere`+`region`)뿐이다.
- 상용 이미지 생성 API 어댑터·키·라우터가 없고, `api/src/main.py`의 라우터 등록 목록에도 없어 HTTP로 노출되지 않는다. 콘텐츠 정책 필터도 두지 않는다(ADR `260730-070532` — 모듈 docstring이 `docs/image-generation.md` 4장의 "전체이용가 상한" 기술이 그 ADR 이후 무효임을 명시).

## 스토리지·파일

- 외부 오브젝트 스토리지(S3 등) 연동 없음. 파일 업로드 엔드포인트(`UploadFile`) 없음 — `python-multipart`는 FastAPI 요구사항으로만 설치돼 있다.
- 유일한 파일 처리: `api/src/domains/manuscript/service/export_service.py`가 stdlib `zipfile.ZipFile(..., ZIP_DEFLATED)`로 `io.BytesIO`에 원고 ZIP을 조립해 응답으로 흘린다(파일시스템에 쓰지 않음). 엔드포인트 `GET /api/v1/works/{work_id}/export`.
- web 쪽은 `web/src/features/works/api/manuscript-export.api.ts`가 raw `fetch`로 받는다 — 생성 axios SDK가 `responseType: 'json'` 고정이라 바이너리를 다룰 수 없기 때문이며, 401 처리는 SSE 경로와 같은 단일-비행 refresh 재시도 정책을 미러링한다.

## SSE 스트리밍 — 서버·클라이언트 배선

서버는 `sse_starlette.EventSourceResponse`를 chat·assist·manuscript 세 라우터에서 쓴다. 스트리밍 엔드포인트는 `POST /api/v1/chat/stream`, `POST /api/v1/works/{work_id}/chat/messages`, `POST /api/v1/works/{work_id}/synopsis/continue`, `POST /api/v1/works/{work_id}/chapters/{chapter_id}/assist/{continue|infill|dialogue|style|correct|title}` 6종.

와이어 포맷: 청크당 `data: <chunk>\r\n\r\n`, 종료 시 `data: [DONE]\r\n\r\n`, 실패 시 `event: error\r\ndata: <message>\r\n\r\n`.

**클라이언트가 생성 SDK를 쓰지 않는 이유** — `docs/openapi.json`의 어떤 operation도 `text/event-stream` 응답을 선언하지 않는다(FastAPI가 `EventSourceResponse` 라우트를 그렇게 표기하지 않음). 그래서 hey-api가 만든 SSE 지원 코드(`web/src/api/core/serverSentEvents.gen.ts`)는 채택되지 않고, 세 파일이 같은 수동 파서를 각자 구현한다: `web/src/features/editor/api/assist.api.ts`, `web/src/features/memory/api/chat.api.ts`, `web/src/features/works/api/synopsis-continue.api.ts`. 공통 형태는 `fetch()` → `ReadableStream<Uint8Array>` → `toTextChunks()`(TextDecoder 스트리밍 디코딩) → `parseSseTextStream()`(`\n\n` 경계 버퍼링, `data:` 병합, `event: error`는 throw, `[DONE]`에서 종료). axios 인터셉터를 우회하므로 401은 `refreshAccessToken()`으로 직접 처리한다. 요청 바디 타입만은 생성 타입(`ContinueRequest` 등)을 재사용한다.

`web/src/features/chat/api/chat.api.ts`는 non-streaming JSON 경로만 생성 SDK로 감싸고 SSE 엔드포인트는 의도적으로 감싸지 않는다(주석 명시).

```
LLM 프로바이더 → ChatLiteLLM.astream → LLMClient.astream(취소 시 로그) → EventSourceResponse
  → (dev) Vite 프록시 → fetch → toTextChunks → parseSseTextStream → React 상태
```

## 웹훅

수신·발신 웹훅 엔드포인트가 없다. OAuth 콜백(`GET /api/v1/auth/oauth/{provider}/callback`, 개시는 `/api/v1/auth/oauth/{provider}/login`)은 브라우저 리다이렉트 경로이지 서드파티발 웹훅이 아니다.

## CORS·프록시

- CORS: `CORSMiddleware`(`api/src/main.py`) — origin은 `CORS_ORIGINS`(JSON 배열 또는 콤마 구분, `cors_origins_list`가 파싱), `allow_credentials=True`, methods·headers 전체 허용, `expose_headers=["X-Correlation-ID"]`.
- dev 프록시: `web/vite.config.ts`의 `/api` → `http://localhost:8000`, **rewrite 없음**(백엔드가 `/api/v1` 접두로 서빙하므로 경로를 그대로 전달). dev baseURL이 빈 문자열이라 생성 SDK 경로가 상대 요청이 되고 프록시가 `:8000`으로 넘긴다.
- prod 컨테이너는 uvicorn을 `--proxy-headers --forwarded-allow-ips='*'`로 띄우도록 Dockerfile CMD가 구성돼 있다.

## 관측성

- 구조화 로깅 `structlog`(`api/src/core/logging.py`, 22개 파일에서 사용) — dev는 `ConsoleRenderer(colors=True)`, prod는 `JSONRenderer(ensure_ascii=False)`. 소음 로거 7개(`uvicorn.access`·`sqlalchemy.engine`·`httpx`·`httpcore`·`openai`·`LiteLLM`·`litellm`)를 WARNING으로 억제한다 — openai/litellm이 DEBUG에서 매 호출마다 프롬프트·헤더를 거대한 한 줄로 덤프하는 대신, `llm_client.py`가 프롬프트·응답을 읽기 좋은 형태로 직접 찍기 때문이다.
- 상관관계 ID: `CorrelationIdMiddleware`(`api/src/core/middleware.py`) — `X-Correlation-ID`를 읽거나 새로 생성해 structlog contextvars에 바인딩하고 응답 헤더로도 반환. `llm_call_logs`가 같은 값을 저장해 요청↔LLM 호출을 연결한다.
- 헬스 엔드포인트 2개: `GET /health`(상태+env, docker healthcheck·로드밸런서용), `GET /ready`(postgres `SELECT 1` + redis `ping` + SMTP 220 배너 실제 확인, 하나라도 실패하면 503 + `degraded`).
- 외부 APM·에러 트래킹(Sentry 등) 연동은 없다.
