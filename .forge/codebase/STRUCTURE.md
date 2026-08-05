---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# STRUCTURE

## 1. 리포지토리 최상위

```
story-weaver/
├── api/            FastAPI 백엔드 (자체 CLAUDE.md — 백엔드 작업 시 먼저 읽을 것)
├── web/            React 19 + Vite 프론트엔드
├── docs/           제품 설계 문서 6종 + docs/openapi.json(생성물, 8절)
├── .forge/         용어집(CONTEXT.md)·결정 기록(adr/)·회고(retro/)·이 codebase/ 지도
├── .claude/        agents/ 5장 · hooks/forge-claim-check.py · settings.local.json · launch.json
├── Taskfile.yml    루트 오케스트레이션 (api:/web: 네임스페이스 include)
├── CLAUDE.md       리포 전체 가이드 (web 영역 중심)
├── README.md       2줄 스텁
└── 기획.md          초기 기획 메모
```

`docs/`는 `PRD.md`(191줄)·`architecture.md`(243)·`data-model.md`(463)·`ai-pipeline.md`(322)·`image-generation.md`(185)·`roadmap.md`(282) + `openapi.json`(160KB 생성물) + `superpowers/specs/2026-06-18-storyweaver-web-ui-design.md`. 코드 주석이 `data-model.md 2장`, `ai-pipeline.md §4.1`처럼 이 문서들의 절 번호를 자주 인용한다.

루트 `.gitignore`는 `.playwright-mcp/`·`.forge/quick/`·`.gstack/`·`.forge/visual/`만 제외하므로 `.forge/`의 나머지(CONTEXT·adr·retro·codebase)와 `docs/openapi.json`은 추적된다. Python·Node 산출물은 `api/.gitignore`·`web/.gitignore`가 각각 담당한다(`web/.gitignore`는 `.env*` 전체 제외).

## 2. `api/` 트리

```
api/
├── src/                              PYTHONPATH 루트 (src layout) — 161 파일 13,974 LOC
│   ├── main.py                       앱 팩토리 + lifespan + _register_routers (408줄)
│   ├── __main__.py                   python -m 실행 진입점
│   ├── core/                         횡단 관심사 (9 파일)
│   │   ├── config.py                  Settings/LLMSettings (pydantic-settings, 616줄)
│   │   ├── database.py                Base · async engine · get_async_session(커밋 소유자)
│   │   ├── exceptions.py              AppError 계층 + register_exception_handlers
│   │   ├── middleware.py              CorrelationIdMiddleware
│   │   ├── rate_limit.py              slowapi Limiter · LLM_RATE_LIMIT · 429 핸들러
│   │   ├── llm_call_context.py        LLM 호출 로그용 ContextVar
│   │   ├── logging.py                 configure_logging (structlog)
│   │   └── redis.py                   Redis 클라이언트 (블랙리스트·예산·캐시)
│   ├── infra/llm/provider_factory.py  make_chat_litellm() — ChatLiteLLM 유일 생성 지점
│   └── domains/<bc>/                 15개 디렉터리 (3절)
├── alembic/
│   ├── env.py                        8개 도메인 models를 noqa: F401로 명시 import
│   └── versions/                     0001_initial_schema.py · 0002_purge_empty_embeddings.py
├── scripts/                          export_openapi.py · manage.py(운영자 CLI) ·
│                                     smoke_test.py · wait_for_services.{py,sh}
├── tests/                            17 서브디렉터리 + 루트 테스트 7개 (총 83 test_*.py, 20,653 LOC)
├── Taskfile.yml                      dev/test/lint/openapi/migrate/prod-* 등
├── pyproject.toml                    의존성 + ruff/mypy/pytest/coverage 설정 한 곳
├── docker-compose.yml(+.prod.yml)    postgres · redis · mailpit
├── .env.example                      변수 이름만 참고 (실제 값은 .env/.env.prod, 커밋 금지)
├── .secrets.baseline                 detect-secrets 스캔 기준선 (pre-commit)
└── CLAUDE.md                         백엔드 전용 규칙(도메인 경계 등)
```

## 3. `api/src/domains/` — 도메인별 실제 계층 구성

| 계층 구성 | 도메인 | 계층 밖 추가 모듈 |
|---|---|---|
| 5계층 완비 | `auth` | `security.py`(415줄) · `oauth/{google,kakao,naver}.py` · `admin_ops.py` · `email.py` |
| 5계층 완비 | `chat` | `ports.py`(414) · `container.py` · `llm_client.py`(544) · `llm_factory.py`(266) |
| 5계층 완비 | `works` `manuscript` `worldbible` `timeline` `dynamic_update` | `manuscript/service/export_service.py`(zip 조립) |
| 5계층 완비 | `memory` | `embedding_client.py`(로컬 384차원 임베딩) |
| `router/schemas/service` | `conflicts` `relationships` | `conflicts/rules.py`(충돌 판정 규칙) |
| `router/schemas/service` | `assist` | `tier_routing.py` · `correct_cache.py` |
| `service`만 | `budget` `moderation` `image_generation` | `budget/dependency.py`(게이트) |
| 계층 없음 | `shared` | `base.py` · `events.py`(226) · `types.py` |

주의할 두 도메인:
- **`image_generation`은 배선되지 않았다** — `api/src` 안에서 import하는 코드가 0건이고 `main.py`에 라우터도 없다. 유일한 사용자는 `tests/image_generation/`. 여기 코드를 "동작하는 선례"로 삼지 말 것(근거: ARCHITECTURE.md 2절).
- **`shared`는 정의만 있고 쓰이지 않는다** — `Entity`/`AggregateRoot`/`DomainEventBus`/`NewType` ID가 있지만 어느 도메인도 import하지 않는다. 새 패턴의 본보기로 쓰기 전에 이 사실을 감안할 것.

## 4. `web/` 트리

```
web/
├── src/                              비생성 .ts/.tsx 20,637 LOC
│   ├── main.tsx                      엔트리 — StrictMode + RouterProvider(router)
│   ├── routeTree.gen.ts              생성물(599줄) — 절대 직접 수정 금지
│   ├── routes/                       파일 기반 라우트 26개 (6절)
│   ├── features/<도메인>/            기능 단위 자기완결 모듈 11개 (5절)
│   ├── api/                          생성물 17 파일 7,651 LOC — 직접 수정 금지
│   │   ├── sdk.gen.ts · types.gen.ts · client.gen.ts · index.ts
│   │   ├── @tanstack/react-query.gen.ts        Query/Mutation 옵션 팩토리
│   │   └── client/ · core/                     hey-api 런타임
│   ├── components/
│   │   ├── ui/                       shadcn 계열 프리미티브 30개 + ui/modal/ 7 파일
│   │   ├── layout/                   app-shell · work-shell · work-tree(459줄) ·
│   │   │                             top-bar · sidebar-parts · user-menu · logo-mark
│   │   ├── theme-toggle.tsx
│   │   └── dev/form-devtool.tsx
│   ├── stores/                       도메인 무관 전역 — modal-store.ts · modal.types.ts
│   ├── lib/                          api-client.ts · api-interceptors.ts · router.ts · utils.ts
│   ├── hooks/                        use-mobile.ts · use-theme.ts
│   ├── providers/app-providers.tsx   QueryClientProvider + 인터셉터 부작용 import
│   ├── styles/globals.css            Tailwind v4 엔트리
│   ├── test/                         setup.ts(vitest 전역) · smoke.test.ts
│   └── vite-env.d.ts
├── openapi-ts.config.ts              input ../docs/openapi.json → output ./src/api
├── vite.config.ts                    tanstackRouter · react · tailwindcss · tsconfigPaths + /api 프록시(:8000)
├── vitest.config.ts                  jsdom · globals · setupFiles
├── biome.json                        린트/포맷 (import 경계 규칙 없음, 8절 ignore 목록)
├── tsconfig.json                     strict · paths "@/*" → ./src/* · exclude src/api
├── package.json                      pnpm@10.28.2 · Node ≥22.18
└── Taskfile.yml                      dev/build/generate/check 등
```

기능별 파일 수(`.ts`/`.tsx`, 테스트 포함)와 하위 폴더 구성:

| 기능 | 파일 | 하위 폴더 |
|---|---|---|
| `works` | 26 | api components lib schema |
| `editor` | 17 | api components lib |
| `world-bible` | 15 | api components lib |
| `auth` | 14 | api components lib schema store types |
| `shared` | 12 | api mock store types.ts |
| `settings` | 10 | components schema store types |
| `timeline` | 7 | api components lib |
| `admin` | 6 | components mock store types.ts |
| `memory` | 6 | api components |
| `landing` | 1 | components |
| `chat` | 1 | api (파사드 1개 — 화면은 `memory/components/memory-panel.tsx`의 ChatTab이 소비) |

CLAUDE.md가 열거하는 도메인 목록에는 `admin`·`landing`·`chat`이 빠져 있다 — 실제 트리가 위 11개다.

## 5. `web/src/features/<도메인>/` 내부 패턴

기능 하나는 아래 중 실제로 필요한 것만 갖는다(전부 갖는 기능은 없다).

- `components/` — 화면·조립 컴포넌트. 화면 단위는 `*-screen.tsx`(`dashboard-screen.tsx`·`bible-screen.tsx`·`editor-screen.tsx`·`reading-screen.tsx`·`timeline-screen.tsx`·`landing-screen.tsx`·`llm-screen.tsx`·`account-screen.tsx`·`admin-stats-screen.tsx` 등).
- `api/` — 생성 SDK를 감싸는 파사드 `*.api.ts`. `throwOnError: true`로 성공 데이터만 반환하는 객체(`worksApi`) + Query/Mutation 옵션 재노출(`worksQueries`/`worksMutations`). **SSE 엔드포인트는 예외** — `editor/api/assist.api.ts`·`memory/api/chat.api.ts`가 raw `fetch` + 자체 SSE 파서(`parseSseTextStream`)와 401 재시도를 각각 갖는다.
- `lib/` — 매핑·하이드레이션·파싱 헬퍼. `hydrate-*.ts`(`hydrate-works`·`hydrate-entities`·`hydrate-chapters`·`hydrate-timeline`·`hydrate-conflicts`)가 Query 결과를 Zustand로 밀어 넣는 훅, `*-mapping.ts`(`work-mapping`·`entity-mapping`·`attributes-mapping`)가 서버 응답↔프론트 타입 변환, 그 밖에 `parse-suggestions.ts`(AI 후보 JSONL 파서, 4계층 관용)·`word-diff.ts`·`guard.ts`·`api-error.ts`.
- `store/` — 기능 전용 Zustand 스토어(`auth.store.ts`·`settings.store.ts`·`admin.store.ts`). 여러 기능이 공유하는 스토어는 `features/shared/store/`(`works.store.ts` 509줄 · `selectors.ts`).
- `schema/` — zod 폼 검증(`auth.schema.ts`·`settings.schema.ts`·`genre-presets.schema.ts`).
- `mock/` — 실 API가 없거나 미구현 필드의 시드값(`admin/mock/members.ts`의 `seedMembers`, `shared/mock/works.ts`의 `seedUsage`). 현재 이 둘만 남았다.
- `types/` 또는 폴더 최상위 `types.ts` — 도메인 전용 타입. 여러 기능이 함께 쓰는 공통 타입은 `features/shared/types.ts` 하나에 모인다.

## 6. `web/src/routes/` — 라우트 배치와 보호

파일 기반 라우트 26개(테스트 제외). 평면(`.` 구분) 표기와 폴더 표기가 섞여 있다.

```
__root.tsx                       AppProviders + SessionRestore + Modals + Toaster
index.tsx                        / — 공개 랜딩(LandingScreen), 게이트 없음
auth/login.tsx · auth/signup.tsx
works/index.tsx · works/new.tsx
works/$workId.tsx                작품 레이아웃 — 하이드레이션 게이트(WorkLayout)
works/$workId/index.tsx · synopsis.tsx · timeline.tsx
works/$workId/bible.tsx          + bible.index · bible.new · bible.edit · bible.relationships (평면 표기)
works/$workId/write/index.tsx · write/$chapterId.tsx
works/$workId/read/index.tsx · read/$chapterId.tsx
settings.tsx + settings/{index,account,llm}.tsx
admin.tsx + admin/{index,stats}.tsx
```

보호는 **루트가 아니라 개별 라우트**가 담당한다 — 17개 라우트 파일이 `beforeLoad: () => requireAuth('/경로')`(`features/auth/lib/guard.ts`)를 호출하고, `admin.tsx`만 `requireAdmin`(현재 `requireAuth`와 동일 동작)을 쓴다.

## 7. 무엇을 고치려면 어디를 보라

| 하고 싶은 일 | 볼 곳 |
|---|---|
| 새 백엔드 엔드포인트 추가 | `api/src/domains/<bc>/router/*.py` + `service`/`repository`/`models`/`schemas`, `api/src/main.py`의 `_register_routers()`에 `try/except ImportError` 블록 추가 |
| DB 스키마 변경 | 해당 도메인 `models/*.py` → `api/alembic/env.py`에 그 도메인 import가 있는지 확인 → `task api:revision`(대화형 메시지 입력) → SQL 리뷰 후 커밋 → `task api:migrate` |
| LLM 프로바이더/모델 교체 | `.env`의 `LLM_PROVIDER`(+해당 키 변수)만 변경 — 라우팅은 `api/src/core/config.py`의 `LLMSettings.as_litellm_kwargs`. 어댑터 자체를 바꾸려면 `api/src/infra/llm/provider_factory.py` |
| 집필 보조 작업의 티어 재배정 | `api/src/domains/assist/tier_routing.py`의 `TASK_TIER`. 단 assist 6작업의 실제 경로는 `get_fast_writing_client()`(표 우회 seam)이므로 그쪽도 함께 확인 |
| 인증/JWT/RBAC | `api/src/domains/auth/security.py`(토큰·해시·블랙리스트·`require_permission`), `auth/router/auth_router.py`(엔드포인트) |
| 스트리밍 취소 시 과금·저장 | `assist_router._stream_response` · `chat_router._stream_work_chat_response` · `manuscript_router._stream_synopsis_continue` — 셋 다 `anyio.CancelScope(shield=True)` 필수. 회귀 테스트 `api/tests/test_stream_cancel_{accounting,shield}.py` |
| LLM 실패 문구·분류 | `api/src/domains/moderation/service/moderation_service.py`(`PROVIDER_DECLINE_MESSAGE`·`LLM_UNAVAILABLE_MESSAGE`·`_OPERATIONAL_LLM_ERRORS`) |
| 레이트리밋·예산 한도 | `api/src/core/rate_limit.py`(`LLM_RATE_LIMIT`), `api/src/domains/budget/`(`budget_token_limit`은 `core/config.py`) |
| API 계약을 프론트에 반영 | 루트 `task contract`(= `api:openapi` → `docs/openapi.json` → `web:generate` → `web/src/api/**`). 검증까지면 `task contract-check`. `web/src/api/`는 직접 편집 금지 |
| 프론트 새 화면 | `web/src/features/<도메인>/components/*-screen.tsx` + 필요 시 파사드 `api/*.api.ts` + `web/src/routes/`에 라우트 파일 |
| 서버 데이터를 화면에 붙이기 | 파사드 `api/*.api.ts` → `lib/hydrate-*.ts` 훅 → `features/shared/store/works.store.ts`. 쓰기(생성·수정)는 스토어 액션이 파사드를 직접 호출하는 기존 패턴을 따른다 |
| SSE 스트리밍 소비 | `features/editor/api/assist.api.ts`의 `useAssistStream` / `features/memory/api/chat.api.ts`의 `useChatStream`(둘 다 `{ start, stop, text, isStreaming, error }`). `stop()` 호출 누락 시 토큰이 계속 탄다 |
| 라우트 접근 보호 | 개별 라우트 파일의 `beforeLoad: () => requireAuth('/경로')`(`web/src/features/auth/lib/guard.ts`) — `__root.tsx`·`index.tsx`는 게이트하지 않는다 |
| 전역 모달/오버레이 | `web/src/stores/modal-store.ts` + `web/src/components/ui/modal/` |
| 공유 UI 프리미티브 | `web/src/components/ui/*.tsx` |
| 앱 레이아웃(사이드바·탑바·작품 트리) | `web/src/components/layout/`의 `app-shell.tsx`·`work-shell.tsx`·`work-tree.tsx`·`sidebar-parts.tsx`·`top-bar.tsx` |
| axios 인증 헤더/401 갱신 | `web/src/lib/api-interceptors.ts`(`createRefreshCoordinator`·`PUBLIC_AUTH_PATHS`). SSE 경로는 각 파사드에 같은 정책이 복제돼 있어 **함께** 고쳐야 한다 |
| dev 프록시·baseURL | `web/vite.config.ts`(`/api` → `:8000`, rewrite 없음), `web/src/lib/api-client.ts`(`createClientConfig`) |

## 8. 생성물 — 직접 편집 금지

| 경로 | 생성 명령 | 소스 |
|---|---|---|
| `web/src/routeTree.gen.ts` | Vite dev/build 시 `@tanstack/router-plugin`(`autoCodeSplitting: true`) | `web/src/routes/**` 파일 트리 |
| `web/src/api/**`(`sdk.gen.ts`·`types.gen.ts`·`client.gen.ts`·`@tanstack/react-query.gen.ts`·`client/`·`core/`) | `pnpm generate`(`web/openapi-ts.config.ts`, `@hey-api/openapi-ts` 0.98.1) | `docs/openapi.json` |
| `docs/openapi.json` | `task api:openapi`(`api/scripts/export_openapi.py`) | `api/src/domains/**`의 라우터/Pydantic 스키마 |
| `api/alembic/versions/*.py` | `task api:revision`(`alembic revision --autogenerate`) | `api/src/domains/**/models/*.py` — **SQL은 반드시 리뷰 후 커밋**(api/CLAUDE.md). 적용은 `task api:migrate` |

툴링 제외 설정: `web/tsconfig.json`이 `src/api`를 `exclude`에 두고, `web/biome.json`의 `files.ignore`가 `src/routeTree.gen.ts`·`src/api`·`docs/openapi.json`(+`node_modules`·`dist`·`.superpowers`·`.claude`)을 제외한다. `api` 쪽은 `pyproject.toml`의 ruff `per-file-ignores`가 `alembic/**`·`scripts/**`·`tests/**`를 완화한다.

## 9. 네이밍 컨벤션

- **백엔드 파일명** — 도메인 접두 + 계층 접미사: `works_router.py`·`works_service.py`·`works_repository.py`·`works_models.py`·`works_schemas.py`(`worldbible`·`manuscript`·`timeline`·`memory`·`dynamic_update`·`chat`·`auth`·`conflicts`·`relationships`·`assist` 모두 동일). 계층 밖 유틸리티는 접미사 없이 도메인 루트에 둔다(`security.py`·`rules.py`·`tier_routing.py`·`correct_cache.py`·`embedding_client.py`·`dependency.py`·`admin_ops.py`). 계층 디렉터리는 `__init__.py`에서 재노출하므로 소비 측은 `from domains.works.service import WorksService`처럼 패키지 경로로 import한다(예외: `memory_search_service`는 순환 임포트 회피로 서브모듈 직접 import).
- **StrEnum 판별 컬럼** — `EntityType`(worldbible) · `EmbeddingSourceType`(memory) · `TimelineStateSource`/`SceneEntityLinkSource`(timeline) · `Tier`/`TaskType`(assist) · `LLMProvider`/`AppEnv`/`LogFormat`(core.config). 전부 `enum.StrEnum` + SQLAlchemy `Enum(..., name="...")`으로 DB에 문자열 저장. 파이썬 예약어·메서드 충돌은 밑줄 접미사로 피한다(`TaskType.continue_`, `TaskType.title_` — 값은 `"continue"`/`"title"`).
- **사용자 대면 명칭 ↔ 코드 식별자 분리** — 표시 명칭이 바뀌어도 테이블/변수명은 기존 이름을 유지한다는 규칙이 모델 주석에 명시돼 있다(`episodes`/`Episode`, `chapters`/`Chapter`). `scene_entity_links`는 이 원칙의 어긋난 잔재로, 씬 폐지 이후에도 옛 테이블명이 남았다(내력: ARCHITECTURE.md 2절).
- **프론트 파일명** — 컴포넌트는 kebab-case 파일 + PascalCase export(`dashboard-screen.tsx` → `DashboardScreen`), 훅은 `use-*.ts` 또는 `hydrate-*.ts`, API 파사드는 `*.api.ts`, 스토어는 `*.store.ts`, 폼 스키마는 `*.schema.ts`, 타입은 `types.ts` 또는 `types/<name>.ts`. 생성 SDK 함수명은 메서드+경로에서 파생된다(`getApiV1WorksByWorkId`) — `openapi-ts.config.ts`가 `operationId`를 일부러 지우기 때문.
- **Biome 포맷** — 들여쓰기 2칸, 작은따옴표, 줄 폭 100, ES5 trailing comma. **Ruff 포맷은 반대로 큰따옴표**, 줄 폭 100, LF. 두 앱의 인용부호 규칙이 다르다는 점을 유의.
- **테스트** — 백엔드는 `api/tests/<도메인>/`이 `api/src/domains/<도메인>/`과 1:1(15개 도메인 전부 존재) + `tests/core/`·`tests/infra/llm/` + 루트 7개(`test_config`·`test_dev_server`·`test_main_runtime`·`test_migrations`·`test_rate_limit`·`test_stream_cancel_accounting`·`test_stream_cancel_shield`). 프론트는 대상 파일과 같은 폴더의 `__tests__/`(24개 디렉터리, 49개 `*.test.ts(x)`).

## 10. 경로 별칭·import 루트

- **web** — `@/*` → `web/src/*`. `tsconfig.json`의 `paths`에 정의하고 `vite-tsconfig-paths` 플러그인으로 Vite·Vitest 양쪽에 동일 적용(`vitest.config.ts`도 같은 플러그인을 쓴다).
- **api** — 별칭이 아니라 **src layout**. `api/src`가 파이썬 import 루트(`api/Taskfile.yml`의 `env: PYTHONPATH: src`, `pyproject.toml`의 `[tool.pytest.ini_options] pythonpath = ["src"]`, mypy `mypy_path = ["src"]`)라 도메인 코드는 `from domains.works.models import Work`처럼 `src.` 프리픽스 없이 import한다. `alembic/env.py`와 `scripts/export_openapi.py`는 스크립트 최상단에서 `sys.path`에 `src`를 직접 넣어 이 규칙을 수동 재현한다.

## 11. 검증 명령 (커밋 전 기본)

```bash
# api — 루트에서 task api:<name>, api/ 안에서 task <name>
task api:lint     # ruff check src tests + mypy src (strict)
task api:test     # pytest — coverage 게이트 --cov-fail-under=70
task api:format   # ruff format + ruff check --fix

# web
task web:check    # typecheck + lint (= tsc --noEmit + biome check .)
task web:test     # vitest run

# 계약 동기
task contract-check   # api:openapi → web:generate → web:check
```

`api/Taskfile.yml`은 이 밖에 인프라(`infra`/`infra-health`/`infra-down`), 운영자 CLI(`verify-email`·`grant-admin`·`reset-password` — `scripts/manage.py`), 스모크(`smoke-test`·`smoke-test-no-chat`), pre-commit(`pre-commit-run`·`secrets-baseline`), 프로덕션(`prod-up`·`prod-migrate` 등)을 제공한다. `task api:dev`는 `deps: [install, migrate]`로 의존성 설치와 마이그레이션까지 선행한다.
