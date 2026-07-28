---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# 코드 컨벤션

StoryWeaver 코드베이스에서 실제로 관찰된 스타일·네이밍·패턴만 정리한다. 도메인 용어의 의미는 `.forge/CONTEXT.md` 소관이라 여기서는 다루지 않는다.

## web (React + TypeScript)

### 포맷터·린터 — Biome

단일 출처: `web/biome.json` (Biome `^1.9.4`, devDependency).

- 들여쓰기 스페이스 2칸(`formatter.indentStyle/indentWidth`), 줄 폭 100(`lineWidth`)
- 따옴표는 작은따옴표(`javascript.formatter.quoteStyle: "single"`), trailing comma `es5`
- import 자동 정렬 활성(`organizeImports.enabled: true`), 린트 규칙은 `recommended`만(커스텀 규칙 추가 없음)
- `files.ignore`로 `src/routeTree.gen.ts`, `src/api`, `docs/openapi.json`을 린트·포맷 대상에서 제외

명령: `pnpm lint` = `biome check .`, `pnpm lint:fix` = `biome check --write .`, `pnpm format` = `biome format --write .` (`web/package.json`).

### TypeScript

`web/tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `target: ES2022`, `moduleResolution: Bundler`. `exclude: ["src/api"]` — 생성 SDK는 타입체크 대상에서도 제외. 경로 별칭 `@/*` → `web/src/*`(`paths` + `vite-tsconfig-paths` 플러그인).

### 파일·심볼 네이밍

- 파일명 kebab-case: `web/src/features/works/components/genre-select.tsx`, `web/src/features/works/components/keyword-tag-input.tsx`.
- 스토어는 `*.store.ts`(`web/src/features/shared/store/works.store.ts`, `web/src/features/auth/store/auth.store.ts`), API 래퍼는 `*.api.ts`(`web/src/features/editor/api/assist.api.ts`), zod 스키마는 `*.schema.ts`(`web/src/features/works/schema/genre-presets.schema.ts`).
- 컴포넌트는 PascalCase named export(예: `export function GenreSelect(...)`), 파일당 default export 관행 없음.
- 훅은 `use` 접두(`useHydrateWorks`, `useAssistStream`).

### 기능 단위 구조

`web/src/features/<도메인>/`가 `components / store / types / schema / lib / api / mock`으로 자기 완결. 관찰된 도메인: `auth, works, world-bible, editor, timeline, memory, settings, shared`. 도메인 간 공유 코드는 `web/src/features/shared/`, 횡단 코드는 `web/src/lib/`.

### 상태 관리 패턴

- **Zustand + immer**: `create<State>()(immer((set, get) => ({...})))` (`web/src/features/shared/store/works.store.ts:97-98`). 액션은 immer draft를 직접 변이한다(`state.works.unshift(...)` 식). 인터페이스(`WorksState`)에 상태 필드와 액션을 함께 선언하고, 각 액션 위에 한국어 JSDoc(`/** ... */`)으로 의도를 남긴다.
- 영속화가 필요한 단순 스토어는 `persist` 미들웨어만 사용(immer 없이): `web/src/features/auth/store/auth.store.ts:16-17` — `create<AuthState>()(persist((set) => ({...}), {...}))`.
- 서버 반영이 끝난 화면은 mock 스토어를 TanStack Query 훅(`useHydrateWorks` 등)으로 하이드레이션하는 과도기 패턴을 쓴다 — `web/src/features/works/lib/hydrate-works.ts` 계열.

### 스키마 정의 (zod)

`zod` (`^3.24.2`)로 정적 데이터/폼 스키마를 검증한다. 예: `web/src/features/works/schema/genre-presets.schema.ts` — JSON 프리셋(`genre-presets.json`)을 모듈 로드 시 `GenrePresetsSchema.parse(...)`로 즉시 검증해 잘못된 데이터를 조기에 throw한다(주석 표기 `// eco: 모듈 로드 시 1회 검증`).

### 스타일링

Tailwind v4(`@tailwindcss/vite`). 조건부 클래스는 `cn(...)`(`web/src/lib/utils.ts` — `twMerge(clsx(inputs))`)으로 병합. 임의값(`text-[11px]`, `bg-[#edf3ec]`)과 의미론적 토큰(`bg-paper`, `text-ink`, `border-line`)이 섞여 쓰인다.

### 라우팅 (TanStack Router)

파일 기반. 각 라우트 파일은 `createFileRoute('<경로>')({ component, beforeLoad? })`를 `Route`로 export(예: `web/src/routes/index.tsx`). 동적 세그먼트는 `$param` 파일명. 인증 게이트는 `src/routes/index.tsx`가 `useAuthStore`로 판단해 리다이렉트. **`src/routeTree.gen.ts`는 생성물이라 수정 금지.**

### 에러 처리 (컴포넌트 레벨)

`try/catch` + `sonner`의 `toast.success`/`toast.error`로 사용자 피드백을 준다. 실패 시 로컬 상태(스토어·에디터)는 되돌리지 않고 사용자의 입력을 보존하는 것이 관행이다 — `web/src/features/editor/components/manuscript.tsx`(테스트로 명시: `web/src/features/editor/components/__tests__/manuscript.test.tsx:194-207` "저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다").

### 주석 관행

한국어 주석으로 "왜"를 설명하는 관행이 강함(예: works.store.ts의 각 액션 JSDoc). `// eco: ...` 접두 주석이 실제로 존재 — forge의 eco(단순화 우선) 모드에서 남긴 근거 주석으로, "왜 이 정도로만 처리했는지"를 표시한다(`web/src/features/works/schema/genre-presets.schema.ts`, `web/src/features/works/components/__tests__/genre-select.test.tsx:7`).

### 생성물 — 직접 편집 금지

`web/src/routeTree.gen.ts`(TanStack Router 플러그인 생성), `web/src/api/**`(`pnpm generate` = `@hey-api/openapi-ts`가 `docs/openapi.json`에서 생성한 타입·SDK·Query 훅) — 둘 다 `biome.json.files.ignore`와 `tsconfig.json`에서 제외되어 있어 린트·타입체크도 적용되지 않는다. API 클라이언트 설정은 `web/src/lib/api-client.ts`, 인터셉터는 `web/src/lib/api-interceptors.ts`.

## api (FastAPI + Python)

### 포맷터·린터 — Ruff

`api/pyproject.toml`의 `[tool.ruff]`: `target-version = "py312"`, `line-length = 100`. 포맷은 `quote-style = "double"`(web과 반대 — 큰따옴표), `indent-style = "space"`, `line-ending = "lf"`.

린트 select: `E, W, F, I, N, UP, B, C4, SIM, ANN, S, T20, PT, RUF`. 전역 ignore: `ANN401`(LLM 경계의 동적 kwargs), `S101`(assert), `B008`(FastAPI DI 기본값 패턴). `per-file-ignores`로 `tests/**`는 `S101/ANN/T20` 등을 대폭 완화, `alembic/**`·`scripts/**`도 별도 완화.

### 타입 — mypy strict

`[tool.mypy]`: `strict = true`, `mypy_path = ["src"]`, `plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]`. 프로토타입 단계라 `disallow_any_generics = false`, `warn_return_any = false`로 일부 완화. `langchain*`, `litellm`, `passlib`, `jose` 등은 `ignore_missing_imports`.

### 구조 — 5계층 도메인 모듈

`api/src/domains/<bc>/`가 `models / repository / service / router / schemas` 5개 패키지로 자기 완결. 각 패키지 안의 파일명은 `<도메인>_<계층>.py` 형태이고 `__init__.py`가 재노출한다. 예(`api/src/domains/works/`): `models/works_models.py`, `repository/works_repository.py`, `service/works_service.py`, `router/works_router.py`, `schemas/works_schemas.py`. `api/CLAUDE.md`가 명시하는 규칙: 도메인 간 직접 DB 모델 import 금지(경계 넘는 참조는 ID로).

### DB 식별자 네이밍

SQLAlchemy 모델은 스네이크케이스 컬럼·복수형 테이블명(`__tablename__ = "works"`), PK는 `UUID(as_uuid=True)` + `default=uuid.uuid4`, FK는 `ForeignKey("users.id", ondelete="CASCADE")` 명시(`api/src/domains/works/models/works_models.py:22-49`). `created_at`/`updated_at`은 `DateTime(timezone=True)` + `server_default=func.now()` 패턴이 반복된다.

### 의존성 주입 (DI)

FastAPI `Depends`로 서비스를 조립한다 — 라우터마다 `_get_service(session=Depends(get_async_session)) -> XxxService` 형태의 프라이빗 팩토리 함수를 두고, 이를 다시 `Depends(_get_service)`로 엔드포인트 인자에 주입한다(`api/src/domains/works/router/works_router.py:48-51`). 서비스는 리포지토리를 생성자 인자로 받는 순수 클래스(리포지토리 자체는 세션을 감싼다) — 테스트에서 fake 리포지토리로 손쉽게 치환 가능하게 하는 설계.

### API 스키마 — camelCase 브리지

Pydantic 스키마는 Python 필드명은 스네이크케이스로 쓰되 `_CamelModel` 공통 베이스(`ConfigDict(alias_generator=to_camel, populate_by_name=True)`)로 응답 시 camelCase 직렬화한다(`api/src/domains/works/schemas/works_schemas.py:12-16`) — 프론트 mock 타입(`web/src/features/shared/types.ts`)과 필드명을 맞추기 위함.

### 에러 처리

도메인 서비스는 `core.exceptions.AppError`의 서브클래스(`NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`)를 raise하고, 라우터가 `except AppError as exc: _raise_http(exc)`로 `HTTPException`으로 변환한다(`api/src/domains/works/router/works_router.py:73-74, 107-111`). 앱 전역 핸들러(`core/exceptions.py`의 `register_exception_handlers`)가 `HTTPException`/`RequestValidationError`/미처리 `Exception`을 JSON(`{"detail": ...}`)으로 통일하고 `X-Correlation-ID` 헤더를 붙인다.

### 로깅

`structlog`(`core/logging.py`)로 구성 — `contextvars.merge_contextvars` + `add_logger_name` + `add_log_level` + ISO 타임스탬프 프로세서 체인, dev는 `ConsoleRenderer(colors=True)`, prod는 `JSONRenderer(ensure_ascii=False)`. 미들웨어(`core/middleware.py`)가 요청마다 correlation id를 `structlog.contextvars`에 bind해 같은 요청의 모든 로그에 자동으로 실린다. 로거는 `structlog.get_logger(__name__)`로 모듈마다 생성하고, `logger.warning("event_name", key=value)` 식 구조화 키워드 인자로 남긴다(`print` 사용은 ruff `T20`으로 금지, `tests/**`·`scripts/**`만 예외).

### 주석 관행

전 모듈 상단에 `from __future__ import annotations` + 한국어 모듈 docstring(무엇을·왜)이 관행이다. 예: `api/src/domains/works/models/works_models.py:1-7`가 "소유 루트는 users, 프론트 mock 타입에 필드를 맞춘다"는 설계 근거를 docstring에 남긴다.

## 커밋 메시지 형식

Conventional Commits 스타일 `<type>(<scope>): <한국어 설명>`을 실제로 따른다(`git log` 확인). 관찰된 type: `feat, fix, chore, refactor, perf`; scope는 `web`, `api`, `forge`, `agents`, 또는 다중(`api,web`) 콤마 결합. 예: `fix(web): AI 생성 화 제목이 저장되지 않던 문제 수정`, `feat(api): admin CLI reset-password 명령 추가`. `api/.pre-commit-config.yaml`이 `commitizen` 훅을 `commit-msg` 스테이지에 걸어 conventional commit 형식을 강제한다(단, 저장소 루트에 `.cz.toml` 등 커스텀 type 목록 설정은 없음 — commitizen 기본 스키마 적용, `[Medium]`). 과거 이력에 `update`, `패스워드 변경 및...`처럼 규칙을 안 지킨 예외 커밋도 존재한다.

## 금지 사항

- `web/src/routeTree.gen.ts`, `web/src/api/**` 직접 편집 금지(생성물).
- 도메인 간 직접 DB 모델 import 금지(`api/CLAUDE.md`) — ID/이벤트로 경계를 넘는다.
- Alembic 마이그레이션은 autogenerate 후 SQL을 리뷰하고서 커밋(`api/CLAUDE.md`).
- 비밀값은 `.env`/`.env.prod`에만 — 커밋 금지, `detect-secrets` pre-commit이 스캔(`api/.secrets.baseline` 베이스라인 기준).

## pre-commit 훅 구성

설정 파일은 `api/.pre-commit-config.yaml` 하나뿐이지만, 설치된 git 훅(`.git/hooks/pre-commit`)은 저장소 **루트**에서 `--config=api/.pre-commit-config.yaml`로 실행되므로 모든 커밋(web만 건드려도 포함)에 관여한다. 체인: `trailing-whitespace / end-of-file-fixer / check-yaml,toml,json / check-added-large-files(--maxkb=1000) / check-merge-conflict / detect-private-key` → `ruff-format`(staged `.py`만) → `ruff --fix --exit-non-zero-on-fix` → 로컬 `mypy` 훅(`pass_filenames: false`, 항상 `src/` 전체 대상) → `detect-secrets` → `commitizen`(commit-msg 스테이지).

**확인된 불일치 [High]**: mypy 훅은 `files: ^src/`일 때만 트리거되도록 설정돼 있고 설정 파일 주석도 "src/ 아래 파일이 staged일 때만 실행"이라 적혀 있다. 그러나 pre-commit은 git 최상위(`git rev-parse --show-toplevel`, 즉 저장소 루트)를 기준으로 staged 파일 경로를 판정하므로, 실제 staged 경로는 `api/src/...`이지 `src/...`가 아니다(`re.search(r'^src/', 'api/src/...')` → `False`로 직접 검증). 즉 이 모노레포 레이아웃에서 **mypy pre-commit 훅은 커밋 시 사실상 한 번도 자동 트리거되지 않는다** — 타입 검증은 `task lint`/`task api:lint`(CI나 로컬에서 수동)로만 실질적으로 걸린다. ruff 훅들은 `types_or: [python, pyi]`로 파일 타입 기반 매칭이라 이 문제의 영향을 받지 않는다.

설치·실행: `task pre-commit-install`(= `uv run pre-commit install`), 전체 파일 대상 실행 `task pre-commit-run`(= `uv run pre-commit run --all-files`). web 쪽은 별도 pre-commit/husky 설정이 없다 — 커밋 전 검증은 `web/Taskfile.yml`의 `check`(= `typecheck` + `lint`, **test 미포함**) 태스크나 `pnpm typecheck && pnpm lint && pnpm test` 수동 실행에 의존한다. `CLAUDE.md`는 "커밋 전 typecheck·lint·test 통과가 기본"이라 적지만, `web/Taskfile.yml`의 `check` 태스크 자체는 test를 실행하지 않는다 — 자동 강제 없이 관례에 의존하는 지점.
