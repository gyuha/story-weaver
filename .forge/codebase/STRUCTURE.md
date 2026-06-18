---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# STRUCTURE

저장소 루트 `/Users/gyuha/workspace/story-weaver`의 디렉토리 레이아웃, 핵심 위치, 네이밍 컨벤션. **현재 코드 실재 기준**.

```
story-weaver/
├── api/        FastAPI 백엔드 (Python, uv)
├── web/        React + Vite 프론트엔드 (pnpm)
├── docs/       제품 설계 문서 (PRD/architecture/data-model/ai-pipeline/roadmap/image-generation)
├── .forge/     forge 상태(CONTEXT.md, adr/, backlog/, codebase/, done/, retro/)
└── README.md, 기획.md
```

---

## 1. API 디렉토리 트리 (`api/`)

`src/`가 import 루트(PYTHONPATH=src). 임포트는 `src` 기준 절대경로.

```
api/
├── src/
│   ├── main.py            앱 팩토리 create_app() + 모듈 전역 app + python -m 실행 블록 (진입점)
│   ├── __main__.py        `python -m` 패키지 진입점 (uvicorn 기동 위임)
│   ├── __init__.py
│   ├── core/              횡단 관심사
│   │   ├── config.py        Settings(pydantic-settings), get_settings() lru_cache 싱글톤, LLMSettings, enum
│   │   ├── database.py      async engine, AsyncSessionFactory, 선언적 Base, get_async_session 의존성
│   │   ├── redis.py         Redis 싱글톤, get_redis_client/get_redis_dep/close_redis_client
│   │   ├── middleware.py    CorrelationIdMiddleware (X-Correlation-ID)
│   │   ├── exceptions.py    register_exception_handlers + AppError 계열 도메인 예외
│   │   └── logging.py       structlog 설정 configure_logging
│   ├── domains/           bounded context 모음 (DDD)
│   │   ├── auth/
│   │   │   ├── router/        auth_router.py (+ __init__ 재export)
│   │   │   ├── service/       auth_service.py
│   │   │   ├── repository/    auth_repository.py (normalize_email 포함)
│   │   │   ├── models/        auth_models.py (User/Role/Permission/RefreshToken/...)
│   │   │   ├── schemas/       auth_schemas.py (Pydantic DTO)
│   │   │   ├── oauth/         google.py / kakao.py / naver.py (provider 어댑터)
│   │   │   ├── security.py    JWT·argon2·블랙리스트·get_current_user·require_permission
│   │   │   └── email.py       fastapi-mail 트랜잭션 메일
│   │   ├── chat/
│   │   │   ├── router/        chat_router.py
│   │   │   ├── service/       chat_service.py (포트에만 의존)
│   │   │   ├── repository/    chat_repository.py
│   │   │   ├── models/        chat_models.py (Conversation/Message)
│   │   │   ├── schemas/       chat_schemas.py
│   │   │   ├── ports.py       AbstractLLMPort, LLMClientProtocol, LLMClientFactoryProtocol
│   │   │   ├── container.py   DI: get_llm_factory / get_chat_service
│   │   │   ├── llm_client.py  LLMClient(ChatLiteLLM 래퍼) + DefaultLLMClientFactory
│   │   │   └── llm_factory.py ProviderFactory (litellm 모델 문자열 라우팅)
│   │   └── shared/
│   │       ├── base.py        Entity/AggregateRoot/ValueObject (순수 dataclass)
│   │       ├── types.py       NewType 식별자 (UserId/RoleId/PermissionId/...)
│   │       └── events.py      인프로세스 도메인 이벤트 버스
│   └── infra/
│       └── llm/
│           └── provider_factory.py  langchain_litellm ChatLiteLLM 생성 단일 소스
├── alembic/
│   ├── env.py             src를 sys.path 추가, .env 로드, DATABASE_URL_SYNC 사용
│   ├── script.py.mako
│   └── versions/          마이그레이션 (현재 0001_initial_schema.py)
├── alembic.ini
├── tests/                 auth/ chat/ infra/ shared/ + conftest.py + test_*.py
├── scripts/               smoke_test.py, wait_for_services.{py,sh}
├── pyproject.toml         uv 의존성 + ruff/mypy/pytest/hatch/coverage 설정
├── uv.lock
├── Taskfile.yml, Justfile 개발 명령(task/just: dev/test/lint/migrate/format)
├── Dockerfile, docker-compose.yml, docker-compose.prod.yml
├── .env, .env.example, .env.prod.example
└── README.md, CLAUDE.md
```

### API 핵심 위치 요약

| 무엇 | 위치 |
|------|------|
| 앱 진입점 / 팩토리 | `api/src/main.py` (`create_app`, 전역 `app`) |
| 설정 싱글톤 | `api/src/core/config.py` (`settings`, `get_settings()`) |
| DB 세션 / Base | `api/src/core/database.py` |
| 인증 의존성·토큰 | `api/src/domains/auth/security.py` |
| RBAC 데이터 모델 | `api/src/domains/auth/models/auth_models.py` |
| LLM provider 라우팅 | `api/src/core/config.py`(`LLMSettings`) + `api/src/domains/chat/llm_factory.py` + `api/src/infra/llm/provider_factory.py` |
| 마이그레이션 | `api/alembic/versions/` |

### API 네이밍 컨벤션 (실재)

- 레이어 파일은 `<도메인>_<레이어>.py`: `auth_router.py`, `auth_service.py`, `auth_repository.py`, `auth_models.py`, `auth_schemas.py`(chat도 동일: `chat_router.py` 등).
- 각 레이어는 디렉토리 + `__init__.py`로 패키지화하고, `__init__.py`가 모듈을 재export(`from .auth_router import *`).
- 라우터: `APIRouter(prefix="/<도메인>", tags=["<도메인>"])`. 도메인 prefix는 `main.py`에서 `/api/v1`로 한 번 더 감쌈 → 최종 `/api/v1/auth/...`, `/api/v1/chat/...`. health(`/health`, `/ready`)는 prefix 없음.
- 헥사고날 포트: `ports.py`에 ABC `Abstract*Port` + Protocol `*Protocol`. DI 바인딩은 `container.py`.
- FastAPI 의존성 함수는 `get_*`(예: `get_async_session`, `get_redis_dep`, `get_current_user`, `get_chat_service`). 사적 헬퍼는 `_`(언더스코어) 접두(예: `_get_service`, `_app_error_to_http`, `_register_routers`).
- ORM 모델: PK는 `id: Mapped[uuid.UUID]`(uuid4 default), 타임스탬프 `created_at`/`updated_at`(server_default `func.now()`). M:N은 `Table`(예: `user_roles`, `role_permissions`).
- 환경변수: `.env` 키 대문자 스네이크(`LLM_PROVIDER`, `JWT_SECRET_KEY`, `POSTGRES_*`). LLM 키는 `LLM_` prefix(`LLMSettings.env_prefix="LLM_"`), provider 크리덴셜은 alias(`OPENAI_API_KEY` 등).
- 마이그레이션 파일: `<번호>_<설명>.py`(예: `0001_initial_schema.py`).

---

## 2. Web 디렉토리 트리 (`web/`)

```
web/
├── src/
│   ├── main.tsx           진입점: RouterProvider 렌더
│   ├── vite-env.d.ts
│   ├── routeTree.gen.ts   TanStack Router 자동 생성 (수정 금지)
│   ├── routes/            file-based 라우트
│   │   ├── __root.tsx       루트 라우트 (AppProviders + Outlet + 전역 UI)
│   │   ├── index.tsx        '/'
│   │   └── auth/
│   │       ├── login.tsx    '/auth/login'
│   │       └── signup.tsx   '/auth/signup'
│   ├── providers/
│   │   └── app-providers.tsx  QueryClientProvider + api-interceptors import
│   ├── lib/
│   │   ├── router.ts          createRouter(routeTree)
│   │   ├── api-client.ts      createClientConfig (baseURL)
│   │   ├── api-interceptors.ts axios Bearer 주입 인터셉터
│   │   └── utils.ts           cn() 등 유틸
│   ├── api/               @hey-api/openapi-ts 자동 생성 (★ helpdesk/Spring openapi 기준 — 실 백엔드와 불일치)
│   │   ├── client.gen.ts, sdk.gen.ts, types.gen.ts, index.ts
│   │   ├── @tanstack/react-query.gen.ts
│   │   ├── core/ (queryKeySerializer/bodySerializer/auth/serverSentEvents/... .gen.ts)
│   │   └── client/ (client/types/utils .gen.ts)
│   ├── stores/
│   │   ├── modal-store.ts     useModal (zustand + devtools)
│   │   └── modal.types.ts
│   ├── features/          기능 모듈
│   │   ├── auth/            (실 백엔드 대신 mock 사용)
│   │   │   ├── components/    hd-login-page.tsx, login-form.tsx, signup-form.tsx, ...
│   │   │   ├── hooks/         use-auth-mutation.ts (TanStack Query useMutation)
│   │   │   ├── store/         auth.store.ts (useAuthStore, 인메모리 토큰)
│   │   │   ├── schema/        auth.schema.ts (zod)
│   │   │   ├── types/         auth.ts
│   │   │   └── lib/           mock-auth-api.ts (★ mock)
│   │   └── helpdesk/         (★ 템플릿 잔재: board/post/comment/admin)
│   │       ├── components/ (+ components/ui/ hd-*.tsx), hooks/, store/, lib/
│   ├── components/
│   │   ├── ui/               shadcn 스타일 (button/dialog/form/... + modal/)
│   │   ├── layout/           auth-shell.tsx
│   │   ├── dev/              form-devtool.tsx
│   │   └── theme-toggle.tsx
│   ├── hooks/             use-mobile.ts, use-theme.ts
│   ├── sample/            (★ 템플릿 잔재: layout/navigation.ts, i18n/)
│   └── styles/           globals.css, helpdesk.css
├── public/
├── dist/, .tanstack/     빌드/생성 산출물
├── index.html
├── vite.config.ts        tanstackRouter 플러그인 + dev proxy(/api → :8080)
├── openapi-ts.config.ts  코드 생성 설정 (input docs/openapi.json → output src/api)
├── tsconfig.json         strict, @/* → src/*, src/api 제외
├── biome.json            린트/포맷
├── components.json       shadcn 설정 (style base-nova)
├── package.json, pnpm-lock.yaml, pnpm-workspace.yaml
└── DESIGN.md, PRD.md, README.md
```

### Web 핵심 위치 요약

| 무엇 | 위치 |
|------|------|
| 진입점 | `web/src/main.tsx` |
| 루트 라우트 / 전역 프로바이더 | `web/src/routes/__root.tsx`, `web/src/providers/app-providers.tsx` |
| 라우터 인스턴스 | `web/src/lib/router.ts` |
| 라우트 정의 | `web/src/routes/**` (file-based) |
| 생성 API SDK | `web/src/api/` (helpdesk openapi 기준 — 주의) |
| API baseURL / 인터셉터 | `web/src/lib/api-client.ts`, `web/src/lib/api-interceptors.ts` |
| 인증 클라이언트 상태 | `web/src/features/auth/store/auth.store.ts` |
| 모달 상태 | `web/src/stores/modal-store.ts` |

### Web 네이밍 컨벤션 (실재)

- 라우트: `web/src/routes/` 하위 파일 경로 = URL 경로. 각 파일은 `export const Route = createFileRoute('/path')({ component })`. 자동 생성 트리는 `routeTree.gen.ts`.
- 자동 생성 파일은 `*.gen.ts`(`routeTree.gen.ts`, `web/src/api/*.gen.ts`). 직접 수정 금지(상단 배너 명시).
- feature 모듈은 `web/src/features/<feature>/` 아래 `components/ hooks/ store/ schema/ types/ lib/`로 분할.
- 파일명은 kebab-case(`use-auth-mutation.ts`, `hd-login-page.tsx`, `auth.store.ts`, `auth.schema.ts`). 도메인 접미 컨벤션: 스토어 `*.store.ts`, zod 스키마 `*.schema.ts`.
- helpdesk feature 전용 UI는 `hd-` 접두(`hd-login-page.tsx`, `hd-avatar.tsx`, `hd-toast.tsx` 등).
- 훅은 `use-*`(`use-mobile.ts`, `use-posts.ts`), Zustand 스토어 export는 `use<Name>Store`(`useAuthStore`) 또는 `useModal`.
- 경로 별칭 `@/` = `web/src/`(tsconfig + vite-tsconfig-paths).
- 생성 SDK 함수명은 operationId 제거 후 `<method><Path>` 카멜케이스(예: `postAuthLogin`, `getBoardsByBoardIdPosts`). TanStack Query 헬퍼는 `*Mutation`/`*Options`(`react-query.gen.ts`).
