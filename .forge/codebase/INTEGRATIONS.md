---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# INTEGRATIONS

현재 web는 UI 우선(mock) 단계다. 화면은 `features/*/mock`의 시드 데이터를 Zustand 스토어에 채워 동작하고, 실 백엔드 호출(인증·작품·집필)은 아직 배선만 돼 있고 기능 연결은 진행 중이다.

## web — 생성된 API SDK 레이어

- 생성 도구는 `@hey-api/openapi-ts`. 설정 `web/openapi-ts.config.ts`: 입력 `./docs/openapi.json`, 출력 `./src/api`. 플러그인은 `@hey-api/client-axios`·`@hey-api/typescript`·`@hey-api/sdk`·`@tanstack/react-query`. 즉 SDK는 **axios** 기반이며 TanStack Query 훅도 함께 생성된다. parser patch가 `operationId`를 지운다(함수명은 메서드+경로로 도출).
- 재생성 명령은 `pnpm generate`(= `openapi-ts`). 산출물 `web/src/api/`는 **직접 편집 금지**이며 tsc/biome 모두 제외.
- 생성물 구성: `web/src/api/index.ts`(public re-export), `web/src/api/sdk.gen.ts`(SDK 함수), `web/src/api/types.gen.ts`(타입), `web/src/api/client.gen.ts`(클라이언트 인스턴스), `web/src/api/@tanstack/`(Query 옵션), `web/src/api/client/`·`web/src/api/core/`(런타임).
- **주의 — 스펙 불일치**: 현 시점 저장소에 `web/docs/openapi.json`(설정의 input) 파일이 존재하지 않는다. 그리고 생성된 SDK(`web/src/api/index.ts`)는 StoryWeaver 도메인(작품·씬·World Bible)이 아니라 **제네릭 보일러플레이트 API**(boards/posts/comments/admin-users/samples/auth)다. 즉 SDK는 백엔드 스타터 템플릿의 OpenAPI로 생성된 잔재이며 실제 도메인 엔드포인트와 정렬돼 있지 않다. 도메인 API가 확정되면 `docs/openapi.json`을 갱신해 재생성해야 한다. `[High]`
- SDK에 노출된 인증 엔드포인트는 `postAuthLogin`·`postAuthSignup`·`postAuthRefresh`·`postAuthLogout`(`web/src/api/index.ts`). 현재 web 코드 어디서도 이 SDK 함수를 호출하지 않는다(인증은 아래의 mock 스토어로 처리).

## web — HTTP 클라이언트 설정

- 클라이언트 런타임 설정은 `web/src/lib/api-client.ts`: `createClientConfig`가 baseURL을 `import.meta.env.VITE_API_BASE_URL ?? '/api'`로 지정. 즉 env가 없으면 `/api`(Vite 프록시 경유).
- 클라이언트 인스턴스는 생성물 `web/src/api/client.gen.ts`가 위 설정을 주입해 만든다(axios 기반).
- 인터셉터는 `web/src/lib/api-interceptors.ts`: 현재 요청 인터셉터가 패스스루(`(config) => config`)만 한다. 주석상 실제 토큰 주입과 401 재시도(refresh)는 후속(Phase 3) 작업. 이 모듈은 `web/src/providers/app-providers.tsx`에서 import되어 부팅 시 인터셉터를 등록한다.

## web — 개발 프록시

- `web/vite.config.ts`의 dev 서버 프록시: `'/api'` → `http://localhost:8080`, `changeOrigin: true`, `rewrite`로 선행 `/api` 제거. 즉 web에서 `/api/foo` 호출 시 백엔드 `http://localhost:8080/foo`로 전달.
- **포트 불일치 주의**: 프록시 타깃은 `:8080`이지만 `api/README.md`의 dev 기본 포트는 `:8000`이다(CLAUDE.md 명시). 로컬 풀스택 구동 시 둘을 맞춰야 한다. `[High]`

## web — 인증(현재 mock)

- 실제 인증/세션 미연결. `web/src/features/auth/store/auth.store.ts`가 Zustand `persist`(localStorage 키 `sw-auth`)로 **시드 로그인 상태**(`isAuthenticated: true`, 사용자 `baekya@storyweaver.kr`)를 유지한다. 주석상 실 토큰/세션은 Phase 3.
- 라우트 가드는 `web/src/features/auth/lib/guard.ts`의 `requireAuth`(라우트 `beforeLoad`에서 호출, 미인증 시 `/auth/login`으로 redirect). 인증 게이트 진입점은 `web/src/routes/index.tsx`(현재는 랜딩 화면을 렌더).
- 사용자 설정/프로필도 mock — `web/src/features/settings/store/settings.store.ts`(localStorage 키 `sw-settings`, `provider: 'email'`, 품질 티어 등).
- 도메인 데이터(작품·씬·타임라인·엔티티)는 모두 mock 스토어 `web/src/features/shared/store/works.store.ts`(시드 `web/src/features/shared/mock/works.ts`)에서 공급. 실 API 전환 시 생성된 Query 훅으로 교체하는 패턴.

## web — 외부 호스트 의존(런타임)

- Google Fonts(`fonts.googleapis.com`/`fonts.gstatic.com`): Noto Sans KR·Noto Serif KR를 `web/index.html`에서 `<link>`로 로드(preconnect 포함). 그 외 런타임 외부 API 호출 없음.

## api — 외부 통합(백엔드, 요약)

프론트 작업 범위 밖이므로 `api/CLAUDE.md`·`api/.env.example`·`api/src/` 기준 요약. 실제 비밀값은 `api/.env`(커밋 금지).

- **데이터베이스**: PostgreSQL(async, asyncpg) — `DATABASE_URL`/`DATABASE_URL_SYNC` 및 `POSTGRES_*`. 마이그레이션 Alembic(`api/alembic/`).
- **캐시/세션**: Redis — `REDIS_URL`/`REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`.
- **인증 제공자(OAuth)**: Google·Kakao·Naver — 각각 `{GOOGLE,KAKAO,NAVER}_CLIENT_ID`·`_CLIENT_SECRET`·`_REDIRECT_URI`. 자체 JWT(`JWT_SECRET_KEY`, `JWT_ALGORITHM`, 액세스/리프레시 만료)와 RBAC. 도메인 `api/src/domains/auth/`.
- **LLM 제공자**: provider 추상화는 `LLM_PROVIDER` 환경변수 하나로 교체(LangChain + langchain-litellm). 지원 키: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AZURE_OPENAI_*`, `OLLAMA_BASE_URL`. 모델/토큰/온도/스트리밍은 `LLM_DEFAULT_MODEL`·`LLM_MAX_TOKENS`·`LLM_TEMPERATURE`·`LLM_STREAMING`. LLM 호출·**SSE 스트리밍**은 `api/src/domains/chat/`(StoryWeaver 집필 LLM의 기반), provider 팩토리는 `api/src/infra/llm/`.
- **메일(SMTP)**: `MAIL_*`(서버/포트/계정/발신자/TLS). 로컬 개발은 Mailpit(`MAILPIT_SMTP_PORT`/`MAILPIT_UI_PORT`). 비밀번호 재설정 등에 사용(`FRONTEND_RESET_CONFIRM_URL_BASE`).
- **CORS·프론트 URL**: `CORS_ORIGINS`, `FRONTEND_URL`.
- 웹훅: 현재 코드/env에서 외부 웹훅 수신·발신 설정은 확인되지 않음. `[Medium]`
