---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# STRUCTURE

## 1. 리포지토리 최상위

```
story-weaver/
├── api/            FastAPI 백엔드 (자체 CLAUDE.md — 백엔드 작업 시 먼저 읽을 것)
├── web/            React 19 + Vite 프론트엔드
├── docs/           제품 설계 문서 + docs/openapi.json(생성물, 6절)
├── .forge/         용어집(CONTEXT.md)·결정 기록(adr/)·이 codebase/ 지도
└── Taskfile.yml    루트 오케스트레이션(api:/web: 네임스페이스 include)
```

## 2. `api/` 트리

```
api/
├── src/                          PYTHONPATH 루트 (src layout)
│   ├── main.py                   FastAPI 앱 팩토리 + lifespan + 라우터 등록
│   ├── core/                     횡단 관심사
│   │   ├── config.py              Settings(pydantic-settings), LLMSettings
│   │   ├── database.py            Base, async engine, get_async_session
│   │   ├── exceptions.py          AppError 계층 + 예외 핸들러 등록
│   │   ├── middleware.py          CorrelationIdMiddleware
│   │   ├── rate_limit.py          slowapi Limiter, 사용자별 키 함수
│   │   ├── llm_call_context.py    LLM 호출 로그용 ContextVar
│   │   └── redis.py               Redis 클라이언트 (세션/블랙리스트/캐시)
│   ├── infra/llm/provider_factory.py   ChatLiteLLM 생성 — 유일한 호출 지점
│   └── domains/<bc>/             13개 바운디드 컨텍스트 (3절)
│       ├── router/     HTTP 엔드포인트 (FastAPI APIRouter)
│       ├── service/     비즈니스 로직
│       ├── repository/ SQLAlchemy 쿼리
│       ├── models/      ORM 모델 (core.database.Base 상속)
│       └── schemas/     Pydantic 요청/응답
├── alembic/env.py                 각 도메인 models를 명시적으로 import → autogenerate
├── alembic/versions/               마이그레이션 파일
├── scripts/export_openapi.py       app.openapi() → 루트 docs/openapi.json
├── scripts/manage.py                운영자 CLI (verify-email 등)
├── tests/<도메인>/                  pytest, domains/ 트리와 1:1 대응
├── Taskfile.yml                    task dev/test/lint/openapi 등
└── CLAUDE.md                       백엔드 전용 규칙(도메인 경계 등)
```

## 3. `api/src/domains/` — 도메인별 실제 계층 구성

5계층(`router/service/repository/models/schemas`)을 온전히 갖춘 도메인: `auth`, `chat`, `works`, `manuscript`, `worldbible`, `timeline`, `memory`, `dynamic_update`.

계층이 줄어든 경량 도메인(자체 테이블이 없어 `models`/`repository`가 없음): `conflicts`, `relationships`(→ `router/schemas/service`만), `budget`, `moderation`, `image_generation`(→ `service`만, 라우터 없이 다른 도메인 라우터에서 호출됨).

`chat/`은 5계층 외에 헥사고날 포트/DI 파일을 추가로 가진 유일한 도메인: `ports.py`(인터페이스), `container.py`(DI 조립), `llm_client.py`/`llm_factory.py`(구현체). `auth/`는 `oauth/`(google.py·kakao.py·naver.py) 하위 디렉터리와 `security.py`(JWT/RBAC), `admin_ops.py`, `email.py`를 추가로 가진다.

`domains/shared/`는 `base.py`(Entity/AggregateRoot/ValueObject)·`events.py`(DomainEventBus)·`types.py`(NewType ID)를 제공하지만, 실제로 어느 도메인에서도 import되지 않는다(ARCHITECTURE.md 4절) — 여기 코드를 참고 삼아 새 패턴을 만들 때는 "정의는 있으나 실사용 전례가 없다"는 점을 감안할 것.

## 4. `web/` 트리

```
web/
├── src/
│   ├── main.tsx                  엔트리 — RouterProvider(router)
│   ├── routeTree.gen.ts          생성물 — 절대 직접 수정 금지
│   ├── routes/                   TanStack Router 파일 기반 라우트 (라우트 보호 규칙은 6절)
│   ├── features/<도메인>/        기능 단위 자기완결 모듈 (5절)
│   │   └── (auth · works · world-bible · editor · timeline · memory ·
│   │        chat · settings · admin · landing · shared)
│   ├── api/                      생성물 — openapi-ts 출력, 직접 수정 금지
│   │   ├── sdk.gen.ts, types.gen.ts, client.gen.ts
│   │   └── @tanstack/react-query.gen.ts   TanStack Query 훅
│   ├── components/
│   │   ├── ui/                   shadcn 스타일 프리미티브(button, dialog, ...)
│   │   └── layout/                app-shell, work-shell, top-bar, sidebar-parts
│   ├── stores/                   앱 전역 스토어(도메인 무관) — modal-store.ts
│   ├── lib/                      api-client.ts, api-interceptors.ts, router.ts, utils.ts
│   ├── providers/app-providers.tsx   QueryClientProvider 래퍼
│   └── test/setup.ts              vitest 전역 셋업
├── openapi-ts.config.ts           input: ../docs/openapi.json → output: src/api
├── vite.config.ts                 tanstackRouter 플러그인 + /api 프록시(:8000)
├── vitest.config.ts               jsdom, globals, setupFiles
├── biome.json                     린트/포맷 (import 경계 규칙 없음)
├── tsconfig.json                  paths: "@/*" → "./src/*", exclude: src/api
└── Taskfile.yml                    task dev/build/generate/test 등
```

## 5. `web/src/features/<도메인>/` 내부 패턴

기능 하나는 다음 하위 폴더 중 실제로 필요한 것만 갖는다(전부 다 갖는 기능은 없다):

- `components/` — 화면·조립 컴포넌트. 스크린 단위는 `*-screen.tsx` 네이밍(`dashboard-screen.tsx`, `bible-screen.tsx`, `editor-screen.tsx`).
- `api/` — 생성 SDK를 감싸는 파사드(`*.api.ts`), `throwOnError: true`로 성공 데이터만 반환하고 Query/Mutation 옵션을 도메인 이름으로 재노출(`works.api.ts`의 `worksApi`/`worksQueries`/`worksMutations`).
- `lib/` — 매핑·하이드레이션 헬퍼. `hydrate-*.ts`(`hydrate-works.ts`, `hydrate-entities.ts`, `hydrate-chapters.ts`, `hydrate-timeline.ts`)가 TanStack Query 결과를 Zustand 스토어로 밀어 넣는 훅을 담는다. `*-mapping.ts`(`work-mapping.ts`, `entity-mapping.ts`)가 서버 응답 ↔ 프론트 도메인 타입 변환을 담당.
- `store/` — 해당 기능 전용 Zustand 스토어(`auth.store.ts`, `settings.store.ts`, `admin.store.ts`). 여러 기능이 공유하는 스토어(`works.store.ts`, `selectors.ts`)는 `features/shared/store/`에 있다.
- `schema/` — zod 등 폼 검증 스키마(`auth.schema.ts`, `settings.schema.ts`, `genre-presets.schema.ts`).
- `mock/` — 아직 실 API가 없는 도메인의 시드 데이터(`admin/mock/members.ts`) 또는 실 API 전환 후에도 남은 미구현 필드의 시드값(`shared/mock/works.ts`의 `seedUsage`).
- `types/` 또는 폴더 최상위 `types.ts` — 해당 도메인 전용 타입. 여러 기능이 함께 쓰는 공통 타입은 `features/shared/types.ts` 하나로 모인다.

## 6. 무엇을 고치려면 어디를 보라

| 하고 싶은 일 | 볼 곳 |
|---|---|
| 새 백엔드 도메인 엔드포인트 추가 | `api/src/domains/<bc>/router/*.py` + `service`/`repository`/`models`/`schemas`, `api/src/main.py`의 `_register_routers()`에 등록 |
| DB 스키마 변경 | 해당 도메인 `models/*.py` 수정 → `api/alembic/env.py`가 자동 인식(이미 import돼 있다면) → `task revision`으로 리비전 생성 후 SQL 리뷰 → `task migrate`로 적용 |
| LLM 프로바이더/모델 교체 | `.env`의 `LLM_PROVIDER`만 변경(`api/src/core/config.py` `LLMSettings`) — 코드 변경 없음. 어댑터 구현 자체를 바꾸려면 `api/src/infra/llm/provider_factory.py` |
| 집필 보조 작업의 품질 티어(저비용/고품질) 재배정 | `api/src/domains/assist/tier_routing.py`의 `TASK_TIER` |
| 인증/JWT/RBAC 로직 | `api/src/domains/auth/security.py`(토큰·해시·권한 의존성), `api/src/domains/auth/router/auth_router.py`(엔드포인트) |
| API 계약(백엔드 스키마 변경분)을 프론트에 반영 | 루트 `task contract`(`api:openapi` → `docs/openapi.json` 재생성 → `web:generate` → `web/src/api/**` 재생성). `web/src/api/`는 직접 편집 금지 |
| 프론트 새 화면/기능(mock 단계) | `web/src/features/<도메인>/components/*-screen.tsx` + 필요 시 `store/`(Zustand) + `web/src/routes/`에 라우트 파일 추가 |
| mock → 실 API 배선 전환 | 해당 기능의 `api/*.api.ts` 파사드를 생성 SDK/Query 훅으로 교체 + `lib/hydrate-*.ts` 훅으로 Zustand 스토어에 하이드레이션(참고 사례: `features/works/lib/hydrate-works.ts`) |
| 라우트 접근 보호(로그인 필요) | 개별 라우트 파일의 `beforeLoad: () => requireAuth('/경로')`(`web/src/features/auth/lib/guard.ts`) — 루트 라우트(`routes/__root.tsx`, `routes/index.tsx`)는 게이트를 하지 않는다 |
| 전역 모달/오버레이 | `web/src/stores/modal-store.ts` + `web/src/components/ui/modal/` |
| 공유 UI 프리미티브 추가/수정 | `web/src/components/ui/*.tsx` |
| 앱 레이아웃(사이드바·탑바·작품 트리) | `web/src/components/layout/app-shell.tsx`, `work-shell.tsx`, `work-tree.tsx`, `sidebar-parts.tsx`, `top-bar.tsx` |
| axios 인증 헤더/401 갱신 로직 | `web/src/lib/api-interceptors.ts`(`createRefreshCoordinator`) |
| dev 프록시·baseURL | `web/vite.config.ts`(`/api` → `:8000`), `web/src/lib/api-client.ts`(`createClientConfig`) |

## 7. 네이밍 컨벤션

- **백엔드 파일명**: 도메인 접두 + 계층 접미사 — `works_router.py`, `works_service.py`, `works_repository.py`, `works_models.py`, `works_schemas.py`(도메인명 `worldbible`도 동일 패턴). 예외적으로 경량 도메인은 계층 접미사 없이 `rules.py`(conflicts), `admin_ops.py`/`email.py`/`security.py`(auth, 계층 밖 유틸리티)처럼 도메인 루트에 직접 둔다.
- **StrEnum 판별 컬럼**: `EntityType`(worldbible), `EmbeddingSourceType`(memory), `TimelineStateSource`/`SceneEntityLinkSource`(timeline), `Tier`/`TaskType`(assist) — 모두 `enum.StrEnum` + SQLAlchemy `Enum(...)`으로 DB에 문자열로 저장.
- **사용자 대면 명칭과 코드 식별자 분리**: "부"의 테이블/변수명은 `episodes`/`Episode`, "화"는 `chapters`/`Chapter`(주석에 명시: 코드/DB 식별자는 기존 이름 유지, 표시 명칭만 새 용어를 씀). 타임라인 링크 테이블은 이 원칙의 예외로, 옛 이름 `scene_entity_links`가 그대로 남아 있다(자세한 내력은 `ARCHITECTURE.md` 2절 "원고 계층" 참고).
- **프론트 파일명**: 컴포넌트는 kebab-case 파일 + PascalCase export(`dashboard-screen.tsx` → `DashboardScreen`), 훅은 `use-*.ts`/`hydrate-*.ts`, API 파사드는 `*.api.ts`, 스토어는 `*.store.ts`, 스키마는 `*.schema.ts`, 타입은 `*.ts`(단수 `types.ts` 또는 `types/`).
- **테스트**: 백엔드는 `api/tests/<도메인>/`가 `api/src/domains/<도메인>/`과 1:1 대응. 프론트는 대상 파일과 같은 폴더의 `__tests__/`(예: `components/__tests__/dashboard-screen.test.tsx`).

## 8. 생성물 — 직접 편집 금지

| 경로 | 생성 명령 | 소스 |
|---|---|---|
| `web/src/routeTree.gen.ts` | Vite 빌드/dev 시 `@tanstack/router-plugin` 자동 생성 | `web/src/routes/**` 파일 트리 |
| `web/src/api/**`(`sdk.gen.ts`, `types.gen.ts`, `client.gen.ts`, `@tanstack/react-query.gen.ts` 등) | `pnpm generate`(`web/openapi-ts.config.ts`) | `docs/openapi.json` |
| `docs/openapi.json` | `task api:openapi`(`api/scripts/export_openapi.py`) | `api/src/domains/**`의 FastAPI 라우터/Pydantic 스키마 |
| `api/alembic/versions/*.py` | `task revision`(`alembic revision --autogenerate`, `api/Taskfile.yml`) | `api/src/domains/**/models/*.py` — **생성 후 SQL은 반드시 리뷰 후 커밋**(api/CLAUDE.md). 적용은 별도 태스크 `task migrate`(`alembic upgrade head`) |

`web/tsconfig.json`은 `src/api`를 `exclude`에 넣어 타입체크 대상에서 제외한다. `web/biome.json`의 `files.ignore`도 `src/routeTree.gen.ts`·`src/api`·`docs/openapi.json`을 명시적으로 제외한다.

## 9. 경로 별칭

- **web**: `@/*` → `web/src/*`(`web/tsconfig.json`의 `paths`, `vite-tsconfig-paths` 플러그인으로 Vite에도 동일 적용).
- **api**: 별칭이 아니라 **src layout** — `api/src`가 파이썬 import 루트(PYTHONPATH=src)라서 도메인 코드는 `from domains.works.models import Work`처럼 `src/` 프리픽스 없이 import한다. `api/alembic/env.py`와 `api/scripts/export_openapi.py`는 스크립트 최상단에서 `sys.path.insert(0, ".../src")`로 이 규칙을 수동으로 재현한다.
