---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# 테스트

StoryWeaver 모노레포의 실제 테스트 설정·구조·관행. 측정 기준선: **web 49파일 / 291 케이스 / 7,108줄**, **api 83파일 / 888 테스트 함수 / 20,653줄**(api 테스트가 `src/` 13,974줄보다 크다).

**CI가 없다** — `.github/`가 존재하지 않는다. 아래 모든 게이트(api 커버리지 70%, 린트, 타입체크)는 로컬에서 사람이 명령을 칠 때만 실행된다.

**루트에 통합 test 태스크가 없다** [High]. 루트 `Taskfile.yml`의 태스크는 `default·install·dev·dev-api·dev-web·build·check·contract·contract-check`뿐 — `task test`는 정의돼 있지 않다. 테스트는 `task api:test` / `task web:test`(또는 각 디렉터리에서 `task test`)로 개별 호출한다. 루트 `task check`는 `web:check`(typecheck+lint)만 부르며 **어느 테스트도 돌리지 않는다**.

## web — vitest + React Testing Library

### 설정

러너 `vitest ^4.1.9` + `jsdom ^29.1.1`, 라이브러리 `@testing-library/react ^16.3.2` · `@testing-library/user-event ^14.6.1` · `@testing-library/jest-dom ^6.9.1`(모두 devDependency, `web/package.json`).

`web/vitest.config.ts` 전문이 사실상 7줄이다:

- `plugins: [tsconfigPaths()]` — `@/*` 별칭 해석만. dev/build용 `web/vite.config.ts`(Tailwind·TanStack Router 플러그인 포함)와 **완전히 분리된 test 전용 config**이므로 라우터 플러그인은 테스트에서 돌지 않는다.
- `environment: 'jsdom'`, `globals: true`(`describe/it/expect` import 없이 사용 가능 — `tsconfig.json`의 `types: ["vitest/globals"]`가 타입 쪽을 맞춘다)
- `setupFiles: ['./src/test/setup.ts']` — 내용은 `import '@testing-library/jest-dom';` **한 줄뿐**. 전역 shim·공용 렌더 헬퍼·MSW 서버 등 아무것도 없다.

명령: `pnpm test` = `vitest run`(watch 없이 1회). `web/Taskfile.yml`의 `test` 태스크가 이를 감싸며, **`check`(typecheck+lint)에는 test가 포함되지 않는다.**

### 파일 위치·네이밍

소스 옆 `__tests__/` 하위에 둔다 — `features/works/components/genre-select.tsx` ↔ `features/works/components/__tests__/genre-select.test.tsx`. 확장자는 `.test.ts`(순수 로직·API 파사드·스토어) / `.test.tsx`(컴포넌트·훅). 계층별로 `components/__tests__`, `lib/__tests__`, `store/__tests__`, `api/__tests__`, `schema/__tests__`가 각각 생긴다.

분포(측정): `works` 11 · `shared` 7 · `editor` 6 · `auth` 4 · `settings` 3 · `timeline` 3 · `world-bible` 3 · `memory` 2 — **`admin`·`chat`·`landing` 도메인은 테스트 0개**. 그 밖에 `components/layout/__tests__` 2, 라우트 6, 스모크 1.

라우트 테스트는 라우트 트리를 그대로 미러링한다 — `routes/__tests__/__root.test.tsx`, `routes/works/__tests__/$workId.test.tsx`, `routes/works/$workId/read/__tests__/{index,$chapterId,read-hydration-race}.test.tsx`. 하이드레이션 경쟁 조건(race)을 따로 이름 붙여 검증하는 파일이 2개 있다(`work-id-hydration-race`, `read-hydration-race`).

`web/src/test/smoke.test.ts`는 독립 스모크 하나뿐이다 — `test('smoke', () => { expect(1 + 1).toBe(2); });`. 러너 자체가 살아 있는지 확인하는 용도.

### 테스트 설명 문구 — 한국어·영어 혼용

도메인 로직 쪽은 한국어 문장으로 검증 내용을 적는다(`'반영 클릭 시 실 API(acceptSuggestion)를 제안 id와 함께 호출하고 성공 토스트를 보여준다'`, `'저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다'`). 반면 `features/settings/**`와 `lib/__tests__/interceptors.test.ts`는 영어다(`'changes password, clears session, and navigates to login on success'`). 통일 규칙은 없다.

### 목(mock) 관행

- **네트워크 레벨 모킹(MSW) 없음** — `web/package.json`에 `msw`가 없다(grep 0건). 대신 `vi.mock`을 83회 호출해 모듈 경계를 자른다.
- 모킹 대상 상위(측정): `@tanstack/react-router` 14회(주로 `Link`를 앵커로 치환해 라우터 컨텍스트 없이 렌더) · `sonner` 7회(`toast.success`/`toast.error` 호출 여부로 사용자 피드백 검증) · 각 도메인 `*.api.ts` 파사드 6회씩(`world-bible`·`works`·`manuscript`·`auth`) · `hydrate-chapters` 4회 · 스토어 3회씩(`works.store`·`auth.store`) · `@/lib/api-interceptors` 2회 · `@tiptap/react` 1회 · `@tanstack/react-query` 1회.
- **커팅 라인은 도메인 파사드다.** 생성 SDK(`web/src/api/**`)와 실제 axios 인터셉터 체인은 컴포넌트 테스트 경로를 타지 않는다. 인터셉터는 별도로 단위 테스트한다 — `web/src/lib/__tests__/interceptors.test.ts`가 `createRefreshCoordinator`·`isPublicAuthError`를 직접 import해 "동시 401 두 건이 refresh를 정확히 한 번만 호출하고 둘 다 새 토큰을 받는다"를 검증한다.
- **raw `fetch`는 `vi.stubGlobal('fetch', fetchMock)`으로 스텁한다** — axios를 우회하는 SSE·blob 경로 두 곳뿐이다: `features/editor/api/__tests__/assist.api.test.ts`(5회), `features/works/api/__tests__/manuscript-export.api.test.ts`(6회, `URL` 전역도 스텁).
- Zustand는 `beforeEach`에서 `useXxxStore.setState({...})`로 초기화한다(전체 57회) — 스토어가 모듈 싱글턴이라 테스트 간 상태 누수를 막는 유일한 수단.
- TanStack Query는 파일마다 로컬 `wrapper`를 만든다 — `new QueryClient({ defaultOptions: { queries: { retry: false } } })`를 `QueryClientProvider`로 감싼 컴포넌트. **11개 파일에 각각 복붙**돼 있고 공용 헬퍼가 없다(`web/src/test/`에는 `setup.ts`와 `smoke.test.ts`뿐).

### 알려진 취약 지점 — `manuscript.test.tsx`의 assist 훅 모킹

기준 파일: `web/src/features/editor/components/__tests__/manuscript.test.tsx`(529줄, web 최대 테스트 파일).

`useAssistStream`을 모킹할 때 훅 안에서 **진짜 React `useState`를 호출**하고 그 setter를 모듈 스코프 변수에 매 렌더마다 재할당한다(`:61`, `:70`):

```ts
let setMockAssistState: (patch: Partial<MockAssistState>) => void = () => {};
vi.mock('@/features/editor/api/assist.api', () => ({
  useAssistStream: () => {
    const [state, setState] = useState<MockAssistState>({ text: '', isStreaming: false, error: null });
    setMockAssistState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: startSpy, stop: stopSpy, ...state };
  },
}));
```

깨지기 쉬운 조건 네 가지:

1. **`render()` 이전 호출은 조용히 무시된다.** `beforeEach`가 `setMockAssistState = () => {}`(no-op)로 리셋하므로(`:179`), 마운트 전에 부르면 에러 없이 아무 일도 안 일어나고 assertion 단계에서야 실패한다.
2. **`act()` 밖에서 부르면 안 된다.** 내부가 진짜 `useState`이므로 모든 호출을 `act(() => setMockAssistState({...}))`로 감싼다(`:388`, `:398`, `:410`, `:421`, `:451`, `:502`, `:515` 전부 이 패턴). 빼먹으면 React `act` 경고와 타이밍 어긋남이 생긴다.
3. **리렌더마다 setter가 덮이므로 가장 최근 렌더의 `setState`만 살아남는다.** 훅을 쓰는 인스턴스가 둘 이상이거나 언마운트된 인스턴스를 잘못 건드리면 스테일 클로저 문제가 된다.
4. 이 패턴을 새 파일에 복사할 때 `beforeEach`의 no-op 리셋을 빼먹으면 이전 테스트의 클로저가 다음 테스트로 누수된다.

같은 파일에서 `@tiptap/react`도 `Proxy` 기반 체이너블 mock(`:95` — `editor.chain().insertContent(...).run()`)으로 대체돼 있어 **"어떤 커맨드가 호출됐는가"만 검증**한다. 실제 에디터 문서 상태 변화는 이 테스트로 보장되지 않는다.

### jsdom이 재현하지 못하는 것

- `scrollIntoView`·`ResizeObserver`가 jsdom에 없어 `cmdk` 기반 컴포넌트를 렌더하는 테스트마다 직접 주입한다 — `Element.prototype.scrollIntoView = vi.fn()`(4개 파일: `genre-select`·`new-work-screen`·`manuscript`·`suggestion-picker`)과 `vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} })`(2개 파일: `genre-select`·`new-work-screen`). 근거 주석이 `features/works/components/__tests__/genre-select.test.tsx:7`에 있다 — `// eco: jsdom doesn't implement scrollIntoView/ResizeObserver, which cmdk relies on.`
- 실제 레이아웃·CSS 계산(요소가 눈에 보이는지, viewport 밖인지)은 검증 불가 — DOM 순서(`compareDocumentPosition`)나 접근성 트리 쿼리(`{ hidden: true }`)로 우회한다.
- 이 공백을 메우는 수단이 루트 `CLAUDE.md`에 명시돼 있다: 정적 분석으로 단정할 수 없는 것(버튼이 실제로 보이는지, 내비게이션이 실제로 동작하는지)은 **playwriter MCP**로 `http://localhost:3000`을 띄워 육안 확인한다.

### 커버리지

`web/vitest.config.ts`에 `coverage` 블록이 **없다** — web은 커버리지를 측정하지도, 강제하지도 않는다. `pnpm test`는 커버리지 없이 실행된다.

### 검증 명령 (web)

```bash
pnpm typecheck   # tsc --noEmit   (task web:typecheck)
pnpm lint        # biome check .  (task web:lint)
pnpm test        # vitest run     (task web:test — check에는 미포함)
```

## api — pytest

### 프레임워크·설정

`api/pyproject.toml` `[dependency-groups].dev`: `pytest>=8.3.0`, `pytest-asyncio>=0.24.0`, `pytest-cov>=5.0.0`, `httpx>=0.27.0`(ASGI `AsyncClient`), `fakeredis>=2.26.0`. `anyio>=4.6.0`은 dev가 아니라 런타임 의존성(`CancelScope(shield=True)` 용).

**`fakeredis`는 선언만 되어 있고 실제로 import되는 곳이 0곳이다** [High] — Redis 대역은 손으로 쓴 스텁 클래스로 처리한다(`tests/auth/conftest.py:29` `FakeRedis`, `tests/test_main_runtime.py:16` 별도 `FakeRedis`). 죽은 의존성이다.

`[tool.pytest.ini_options]`:

- `asyncio_mode = "auto"` — 데코레이터 없이 `async def test_...`만 쓰면 된다.
- `testpaths = ["tests"]`, `pythonpath = ["src"]`, `python_files = ["test_*.py", "*_test.py"]`, `python_classes = ["Test*"]`, `python_functions = ["test_*"]`
- `filterwarnings = ["error", ...]` — 경고를 에러로 승격하되 세 가지를 면제: `DeprecationWarning`, `PendingDeprecationWarning`, 그리고 langchain_core의 pydantic v1 shim이 Python 3.14+에서 내는 `UserWarning`(주석에 upstream 추적 중이라 명시).
- `addopts = ["--strict-markers", "--cov=src", "--cov-report=term-missing", "--cov-report=html:htmlcov", "--cov-fail-under=70"]` — **커버리지 70% 미만이면 실패**하고, 등록되지 않은 마커를 쓰면 에러가 난다.
- `markers`: `unit`(순수, I/O 없음) / `integration`(DB·Redis 접촉) / `e2e`(구동 중 서버 대상).

**마커 체계는 선언만 있고 거의 적용되지 않았다** — 83개 파일 전체에서 `@pytest.mark.unit` 9회, `@pytest.mark.integration` 4회, `@pytest.mark.e2e` 0회(총 13회). 즉 `task test-unit`/`task test-integration`은 스위트의 극히 일부만 돌린다.

### 디렉터리 구조

`api/tests/`가 `api/src/domains/`를 도메인별로 미러링한다. 파일 수: `auth` 18 · `chat` 10 · `manuscript` 8 · `memory` 7 · `assist` 6 · `works` 6 · `worldbible` 4 · `dynamic_update` 4 · `timeline` 3 · `budget` 2 · `conflicts` 2 · `core`·`image_generation`·`infra`·`moderation`·`relationships`·`shared` 각 1. 여기에 루트 레벨 7개가 더 있다 — `test_config.py`, `test_dev_server.py`, `test_main_runtime.py`, `test_migrations.py`, `test_rate_limit.py`, `test_stream_cancel_accounting.py`, `test_stream_cancel_shield.py`.

`conftest.py`는 10개(루트 + `auth`·`chat`·`conflicts`·`manuscript`·`memory`·`relationships`·`timeline`·`works`·`worldbible`).

### 루트 픽스처 — 싱글턴 vs 이벤트 루프

`api/tests/conftest.py`에 autouse 픽스처 두 개뿐이고 네트워크·DB를 직접 만지지 않는다:

- `settings_cache_clear` — `get_settings()`의 `@lru_cache`를 매 테스트 전후로 비워 `monkeypatch.setenv`가 다음 테스트로 새지 않게 한다.
- `_close_redis_between_tests` — 매 테스트 후 `close_redis_client()`. 이유가 docstring에 적혀 있다: pytest-asyncio는 테스트마다 새 이벤트 루프를 주지만 Redis 클라이언트는 최초 사용 루프에 묶인 싱글턴이라, 재사용하면 "Future attached to a different loop"로 깨진다.

### DB — 실제 PostgreSQL(pgvector), 테스트 전용 DB 없음

`core.database.AsyncSessionFactory`/`engine`을 그대로 써 **실 DB에 쓰고 읽는** 테스트 파일이 34개다. 접속 대상은 `.env`의 `DATABASE_URL`(동기 마이그레이션용은 `DATABASE_URL_SYNC`)이고 기본 인프라는 `api/docker-compose.yml`의 `postgres` 서비스(이미지 `pgvector/pgvector:pg16`, DB 이름 기본 `app_db`, `task api:infra`로 기동). compose 파일은 `docker-compose.yml`·`docker-compose.prod.yml` **두 개뿐 — 테스트 전용 compose도, 별도 테스트 DB도 없다.** 즉 테스트를 돌리면 로컬 dev DB에 실제 행이 생성·삭제된다.

이것이 만드는 제약 세 가지:

- **격리는 트랜잭션 롤백이 아니라 uuid 유니크 데이터 + 수동 teardown이다.** `tests/works/test_works_isolation.py`의 `two_users` 픽스처가 `User(email=f"owner-{uuid.uuid4().hex}@isolation.test")`로 매번 새 계정을 만들고, `yield` **뒤에서** `session.delete(...)` + `commit()`으로 cascade 삭제한다. 테스트가 `yield` 도달 전에 실패하면 정리 코드가 실행되지 않아 고아 행이 dev DB에 영구히 남는다 — 회귀가 아니라 설계상 트레이드오프다.
- **커넥션 풀 정리 픽스처가 33곳에 복제돼 있다.** `core.database.engine`은 모듈 임포트 시 1회 생성되는 싱글턴이라, 이전 루프에 묶인 커넥션이 재사용되면 깨진다. 이를 막는 `@pytest.fixture(autouse=True) async def _dispose_engine_pool(): yield; await engine.dispose()`가 도메인 `conftest.py` **6개**(`manuscript`·`memory`·`worldbible`·`conflicts`·`timeline`·`relationships`)와 개별 테스트 모듈 **27개**에 각각 들어 있다. `assist`·`chat`·`dynamic_update`는 conftest가 아예 없고, `works`의 conftest는 fake 리포지토리용이라 dispose가 없어서 — 이 네 도메인은 실 DB를 쓰는 모든 파일이 픽스처를 인라인으로 다시 쓴다. **새 도메인에 실 DB 테스트를 추가하면서 이 픽스처를 빼먹으면 그 도메인의 두 번째 테스트부터 간헐적으로 실패한다.**
- **직렬 실행 전제.** `pytest-xdist`가 `pyproject.toml`·`uv.lock` 어디에도 없고(grep 0건) `api/Taskfile.yml`의 `test`는 `uv run pytest tests -v`를 워커 지정 없이 돌린다. 같은 실 DB를 공유하고 이벤트 루프-커넥션 결합이 위처럼 예민한 구조에서 `-n auto`를 붙이면 충돌 여지가 크다.

### 실 DB vs fake — 같은 도메인 안에서 파일로 갈린다

`works` 도메인이 대표 예다: `test_works_service.py`(fake 참조 34회)·`test_works_route.py`(`FakeWorksService`)·`test_works_repository.py`는 DB 없이 돌고, `test_works_isolation.py`·`test_works_beat_sheet.py`·`test_works_beat_sheet_rate_limit.py`는 `AsyncSessionFactory`로 실 DB를 탄다. 파일명이 곧 경계다.

Fake 구현체 목록:

- `tests/works/conftest.py` — `FakeWorksRepository`(dict 기반, 실 repo의 `flush` 시 id 부여까지 모사) + 픽스처 `fake_repo`/`works_service`. 서비스가 리포지토리를 생성자로 받는 설계라 `WorksService(fake_repo)` 한 줄로 치환된다.
- `tests/auth/conftest.py` — `FakeRedis`(get/set/exists/delete/ping + `expirations` 기록), `FakeAuthRepository`, `fake_session`(`MagicMock` 기반 commit/rollback/flush no-op).
- 테스트 파일 로컬 fake — `FakeLoginService`·`FakeSignupService`·`FakeRefreshService`·`FakeLogoutService`·`FakeWorksService`(라우터 계층만 검증할 때 서비스를 통째로 override).
- `tests/chat/_mocks.py` — `FakeChatLiteLLM`·`FakeStreamingChatLiteLLM`·`StubLLMClient`. **모킹 경계를 `ChatLiteLLM`(네트워크를 실제로 부르는 최하위 객체)에 두고 그 위(`LLMClient`·`ProviderFactory`·`ChatService`)는 전부 실 구현으로 태운다**(`tests/chat/conftest.py` docstring에 아키텍처로 명시). mock 클래스를 conftest가 아닌 `_mocks.py`에 분리한 이유도 적혀 있다 — 픽스처와 헬퍼 클래스를 혼동하지 않게, 그리고 pytest 없이도 import되게.

`unittest.mock`/`monkeypatch`를 쓰는 줄은 217곳이다.

### 라우트 테스트 헬퍼 — 도메인마다 복제

라우트 테스트는 `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")`로 ASGI 인-프로세스 호출을 하고 `app.dependency_overrides[get_current_user] = lambda: user`로 인증을 우회한다. 이를 감싼 `_client_as(app, user)` 헬퍼가 33개 테스트 모듈에 각각 복제돼 있으며 `dependency_overrides` 호출은 총 120곳이다. 실 DB 격리 테스트는 전체 `app`이 아니라 그 도메인 라우터만 붙인 얇은 `FastAPI()`를 만들어 쓴다(`test_works_isolation.py`의 `app_for` 픽스처).

### 스킵 게이트

명시적 스킵은 한 곳뿐이다 — `tests/auth/test_signup_mailpit_integration.py:68`의 `@pytest.mark.skipif(os.getenv("RUN_MAILPIT_INTEGRATION") != "1", ...)`. 전용 태스크가 이 변수를 세팅하고 커버리지를 끈다: `task test-mailpit-signup` = `RUN_MAILPIT_INTEGRATION=1 uv run pytest tests/auth/test_signup_mailpit_integration.py -v --no-cov`(구동 중인 FastAPI + Mailpit 필요).

### 확인된 문제 — Makefile을 읽는 스테일 계약 테스트 12개가 반드시 실패한다 [High]

`tests/test_dev_server.py`와 `tests/test_migrations.py`는 빌드 파일의 *내용*을 정적으로 검사하는 계약 테스트다. 두 파일 모두 `_PROJECT_ROOT = Path(__file__).parent.parent`(= `api/`) 기준으로 `_MAKEFILE = _PROJECT_ROOT / "Makefile"`을 읽는데, **`api/Makefile`도 저장소 루트 `Makefile`도 존재하지 않는다**(프로젝트가 `Taskfile.yml`로 이전했다). `_makefile_text()`는 가드 없이 `read_text()`를 호출하므로 `FileNotFoundError`가 난다.

영향 범위(직접 세어 확인):

- `tests/test_dev_server.py`의 `TestMakefileHotReload` — 테스트 9개 전부(`--reload`/`--reload-dir`/`uv run`/`--host`/`--port`/`HOST` 기본값 등을 Makefile 타깃에서 찾는다).
- `tests/test_migrations.py`의 `TestMakeMigrate` — 5개 중 3개(`test_migrate_target_waits_for_local_postgres`, `test_migrate_target_applies_alembic_head_with_uv`, `test_dev_bootstrap_runs_migrate_before_uvicorn`). 나머지 2개는 `alembic.ini`와 `alembic/versions/`를 보므로 정상이다.

합계 12개. 즉 **현재 `task api:test`는 DB가 붙어 있어도 실패하며, `--cov-fail-under=70` 게이트에 도달하기 전에 이미 빨간불이다.** (스위트를 실행해 확인한 것이 아니라 소스·파일 존재 여부로 검증한 결론이다.)

같은 파일의 `TestJustfileHotReload`(5개)는 `api/Justfile`이 실재하므로 파일 읽기 자체는 성공하지만, 그 Justfile은 `--reload-dir src/fastapi_bootstrap`을 가리키는 템플릿 유산이다(story-weaver의 소스 루트는 `src`) — 스캐폴딩 잔재로 함께 정리 대상이다 [Medium].

### 커버리지 설정

`[tool.coverage.run]`: `source = ["src"]`, `branch = true`, `omit = ["*/migrations/*", "*/alembic/*", "*/tests/*"]`. `[tool.coverage.report]`: `show_missing = true`, `skip_covered = false`, `exclude_lines`에 `pragma: no cover`·`def __repr__`·`if TYPE_CHECKING:`·`raise NotImplementedError`·`...`. 리포트는 `term-missing` + HTML(`api/htmlcov/`), `task test-cov`가 브라우저로 열어준다.

### 검증 명령 (api)

```bash
task test              # uv run pytest tests -v   (addopts로 --cov-fail-under=70 포함)
task test-unit         # -m unit          (실제 마킹 9곳뿐)
task test-integration  # -m integration   (인프라 기동 필요, 마킹 4곳뿐)
task test-fast         # --no-cov (빠른 피드백)
task test-cov          # --cov-report=html + htmlcov/index.html 열기
task lint              # ruff check src tests + mypy src
```

루트에서는 `task api:test` 형태로 부른다(루트에 통합 `test` 태스크 없음).

### pytest 밖의 검증 — 구동 중 서버 대상 스모크

`api/scripts/smoke_test.py`는 pytest 스위트가 아니라 **실행 중인 FastAPI 서버**를 실 HTTP로 순회하는 독립 스크립트다(`task smoke-test`). 10단계: `/health` + `/ready`(PostgreSQL/Redis/Mailpit 연결) → 회원가입 → Mailpit API에서 토큰 파싱해 이메일 인증 → 로그인 → 보호 엔드포인트 `/auth/me` → 토큰 갱신 → 로그아웃 → 로그아웃 후 401 확인 → 대화 생성 → 메시지 SSE 스트리밍. 실패 시 `exit 1`. 변형 태스크로 `task smoke-test-no-chat`(LLM 키 불필요)·`task smoke-test-skip-verify`가 있다.

`task api:health`/`task api:ready`는 curl 한 방으로 엔드포인트만 찔러보는 더 얇은 확인 경로다.
