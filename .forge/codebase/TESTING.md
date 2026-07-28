---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# 테스트

StoryWeaver monorepo의 실제 테스트 설정·관행. **직전 매핑(2026-06-26, commit `1331c28`) 시점에는 web에 테스트 러너가 전혀 없었다** — 그 이후 vitest + RTL이 추가되고 47개 이상의 테스트 파일이 생겼으므로 이 문서는 그 상태를 새로 반영한다.

## web — vitest + React Testing Library

### 설정

러너: `vitest ^4.1.9`(devDependency, `web/package.json`). 설정은 `web/vitest.config.ts`:

- `environment: 'jsdom'`, `globals: true`(전역 `describe/it/expect` — import 없이 사용)
- `setupFiles: ['./src/test/setup.ts']` — 내용은 `import '@testing-library/jest-dom'` 한 줄뿐(커스텀 matcher 등록 외 추가 글로벌 설정 없음)
- 플러그인은 `vite-tsconfig-paths`만 — 별도 `vite.config.ts`(dev/build용, Tailwind·TanStack Router 플러그인 포함)와는 분리된 test 전용 config

명령: `pnpm test` = `vitest run`(watch 없이 1회 실행). `web/Taskfile.yml`의 `test` 태스크가 이를 그대로 감싼다. **`check` 태스크(typecheck+lint)에는 test가 포함되지 않는다** — `pnpm test`는 별도로 돌려야 한다.

### 파일 위치·네이밍

`__tests__/` 하위 디렉터리에 테스트를 나란히 둔다(소스 파일 옆). 예: `web/src/features/works/components/genre-select.tsx` ↔ `web/src/features/works/components/__tests__/genre-select.test.tsx`. 확장자는 `.test.ts`(순수 로직)/`.test.tsx`(컴포넌트·훅). 도메인마다 `components/__tests__`, `lib/__tests__`, `store/__tests__`, `api/__tests__`, `schema/__tests__`로 계층이 나뉜다. 라우트 테스트는 `web/src/routes/__tests__/`, `web/src/routes/works/__tests__/` 등 라우트 트리를 그대로 미러링. 스모크 테스트 하나가 `web/src/test/smoke.test.ts`에 독립적으로 존재(`expect(1+1).toBe(2)` — CI 파이프라인이 살아있는지 확인하는 용도로 보임).

`describe`/`it` 설명 문구는 한국어로, 무엇을 검증하는지 문장으로 적는다(예: `manuscript.test.tsx`의 `'저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다'`).

### 목(mock) 관행

- **네트워크 레벨 모킹(MSW 등) 없음.** `web/package.json`에 `msw` 의존성이 없다. 대신 각 기능의 `*.api.ts` 래퍼 모듈 자체를 `vi.mock('@/features/.../api/xxx.api')`로 통째로 대체한다(예: `hydrate-works.test.tsx`의 `vi.mock('@/features/works/api/works.api', () => ({ worksQueries: { list: () => ({...}) } }))`). 생성 SDK(`web/src/api/**`)와 `web/src/lib/api-interceptors.ts`의 실제 인터셉터 체인은 이 경로를 타지 않는다 — 인터셉터 자체(401 리프레시 등)만 별도로 `web/src/lib/__tests__/interceptors.test.ts`에서 직접 단위 테스트한다.
- Zustand 스토어는 `beforeEach`에서 `useXxxStore.setState({...})`로 초기화해 테스트 간 상태 누수를 막는다(`hydrate-works.test.tsx`, `interceptors.test.ts`).
- TanStack Router의 `Link`는 `vi.mock('@tanstack/react-router', async (importOriginal) => ({ ...actual, Link: (...) => <a .../> }))`로 실제 라우터 컨텍스트 없이 렌더 가능한 앵커로 치환하는 패턴이 반복된다(`manuscript.test.tsx:10-24`).
- `sonner`의 `toast`는 `vi.mock('sonner', () => ({ toast: ... }))`로 스텁하고 `toast.success`/`toast.error` 호출 여부로 사용자 피드백을 검증한다.

### 알려진 취약 지점 — `manuscript.test.tsx`의 assist 훅 모킹

기준 파일: `web/src/features/editor/components/__tests__/manuscript.test.tsx:54-73`.

`useAssistStream`을 모킹할 때, 실제 React `useState`를 훅 내부에서 호출하고 그 setter를 **모듈 스코프의 `let setMockAssistState`** 변수에 매 렌더마다 재할당하는 구조다:

```ts
let setMockAssistState: (patch: Partial<MockAssistState>) => void = () => {};
vi.mock('@/features/editor/api/assist.api', () => ({
  useAssistStream: () => {
    const [state, setState] = useState<MockAssistState>({...});
    setMockAssistState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: startSpy, stop: stopSpy, ...state };
  },
}));
```

이 구조가 깨지기 쉬운 조건:

1. **`render()` 이전에 호출하면 조용히 무시된다.** `beforeEach`가 `setMockAssistState = () => {}`(no-op)로 리셋하므로, 컴포넌트가 아직 마운트되지 않은 시점에 `setMockAssistState(...)`를 부르면 아무 에러 없이 그냥 아무 일도 안 일어난다 — 테스트가 "통과하는 것처럼" 보이다가 assertion 단계에서야 실패한다.
2. **`act()` 밖에서 호출하면 안 된다.** 내부가 진짜 `useState`이므로 `setMockAssistState(...)`는 반드시 `act(() => setMockAssistState({...}))`로 감싸야 한다(테스트 전체가 이 패턴을 지킴). 빼먹으면 React가 `act` 경고를 던지고 상태 반영 타이밍이 어긋날 수 있다.
3. **훅이 두 번 이상 렌더되면 마지막 렌더의 setter만 살아남는다.** 모듈 스코프 변수 하나에 매 렌더마다 덮어쓰기 때문에, 컴포넌트가 리렌더될 때마다(또는 훅을 쓰는 인스턴스가 둘 이상이면) 이전 렌더의 클로저는 스테일(stale)해지고, 이후 `setMockAssistState` 호출은 항상 **가장 최근 렌더**의 `setState`를 잡는다. 언마운트된 인스턴스의 setState를 잘못 트리거하면 "Can't perform a React state update on an unmounted component" 경고로 이어질 수 있다.
4. 새 테스트 파일에 이 패턴을 복사할 때 `beforeEach`의 리셋(`setMockAssistState = () => {}`)을 빼먹으면 이전 테스트의 클로저가 다음 테스트로 누수된다.

같은 파일에서 `@tiptap/react`도 유사하게 `Proxy` 기반 체이너블 mock(`editor.chain().insertContent(...).run()`)으로 대체돼 있어(`manuscript.test.tsx:90-127`), tiptap 내부 동작이 아니라 "어떤 커맨드가 호출됐는가"만 검증한다 — 실제 에디터 상태 변화는 이 테스트로 보장되지 않는다.

### jsdom이 재현하지 못하는 것

- `scrollIntoView`, `ResizeObserver`가 jsdom에 구현돼 있지 않다 — `cmdk` 기반 컴포넌트(`GenreSelect`)를 렌더하는 테스트마다 `Element.prototype.scrollIntoView = vi.fn()`과 `vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} })`를 직접 주입해야 한다(`web/src/features/works/components/__tests__/genre-select.test.tsx:7-18`, 주석 `// eco: jsdom doesn't implement scrollIntoView/ResizeObserver, which cmdk relies on`). 같은 스텁이 `manuscript.test.tsx:163-164`에도 등장한다.
- 실제 브라우저 레이아웃·CSS 계산(예: 요소가 실제로 화면에 보이는지, viewport 밖으로 스크롤됐는지)은 jsdom으로 검증 불가 — DOM 순서(`compareDocumentPosition`)나 접근성 트리(`hidden: true` 쿼리)로 대체 검증한다(`manuscript.test.tsx:320-352`).
- 이런 한계 때문에 CLAUDE.md는 "정적 분석으로 단정할 수 없는 것"(버튼이 실제로 보이는지, 내비게이션이 실제로 동작하는지)은 playwriter MCP로 `http://localhost:3000`을 띄워 육안 확인하라고 명시한다 — vitest 테스트가 커버하지 못하는 부분을 메우는 용도다.

### 커버리지

vitest 설정(`web/vitest.config.ts`)에 `coverage` 블록이 없다 — **web은 커버리지 수치를 측정·강제하지 않는다.** `pnpm test`는 커버리지 없이 실행된다.

### 검증 명령

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check .
pnpm test        # vitest run
```

## api — pytest

### 프레임워크·설정

`api/pyproject.toml`의 `[dependency-groups].dev`: `pytest>=8.3.0`, `pytest-asyncio>=0.24.0`, `pytest-cov>=5.0.0`, `anyio>=4.6.0`, `httpx>=0.27.0`(ASGI `AsyncClient`), `fakeredis>=2.26.0`.

`[tool.pytest.ini_options]`: `asyncio_mode = "auto"`(테스트는 데코레이터 없이 그냥 `async def`), `testpaths = ["tests"]`, `pythonpath = ["src"]`, 파일 패턴 `test_*.py`/`*_test.py`, `filterwarnings = ["error", ...]`(대부분 경고를 에러로 승격). `addopts`에 `--cov=src --cov-fail-under=70`이 항상 붙는다 — **커버리지 70% 미만이면 `task test`가 실패한다.** 마커 `unit`/`integration`/`e2e`가 선언돼 있지만 실제 테스트 파일에서 `@pytest.mark.integration` 등으로 명시적으로 붙인 곳은 13곳뿐(대부분은 마킹 없이 존재) — 마커 체계는 선언만 있고 전면 적용되지는 않은 상태다.

### 테스트 디렉터리 구조

`api/tests/`가 `api/src/domains/`를 도메인별로 미러링(`auth, works, worldbible, manuscript, memory, timeline, conflicts, relationships, chat, assist, dynamic_update, budget, moderation, image_generation, core, infra, shared`). 81개의 `test_*.py` 파일. 도메인마다 `conftest.py`로 픽스처를 분리한다.

### DB — 실제 PostgreSQL(pgvector), 별도 테스트 DB 없음

`api/tests/works/test_works_isolation.py`, `api/tests/memory/test_vector_isolation.py`, `manuscript/worldbible/timeline/conflicts/relationships` 도메인의 다수 테스트가 **fake repository가 아니라 `core.database.AsyncSessionFactory`/`engine`을 그대로 사용해 실제 DB에 쓰고 읽는다.** 연결 대상은 `.env`의 `DATABASE_URL`(기본값은 `docker-compose.yml`의 `postgres` 서비스 — 이미지 `pgvector/pgvector:pg16`, `task infra`로 기동)이며, **dev와 별도로 분리된 테스트 전용 DB/`docker-compose.test.yml`는 존재하지 않는다** — 즉 `task test`를 돌리면 로컬 dev DB에 실제로 행이 생성·삭제된다.

이것이 만드는 제약:

- **격리는 트랜잭션 롤백이 아니라 uuid 기반 유니크 데이터 + 수동 정리(teardown delete)로 이뤄진다.** 예: `test_works_isolation.py`가 `User(email=f"owner-{uuid.uuid4().hex}@isolation.test")`로 매번 새 계정을 만들고, 픽스처의 `yield` 뒤에서 `session.delete(owner)` + `commit()`으로 cascade 삭제한다. **테스트가 `yield` 도달 전에 실패(assert 실패나 예외)하면 이 정리 코드가 실행되지 않아 고아 행이 dev DB에 영구히 남는다** — 회귀가 아니라 설계상의 트레이드오프다.
- **병렬 실행(pytest-xdist 등)을 쓰지 않는다.** `api/Taskfile.yml`의 `test`는 `pytest tests -v`를 워커 지정 없이 그대로 실행 — 저장소 어디에도 `-n auto`/`pytest-xdist` 의존성이 없다. 같은 실 DB를 공유하는 현재 구조에서 `-n auto`를 붙이면 각 워커의 DB 커넥션이 서로 다른 이벤트 루프에 묶이면서 충돌할 여지가 크다(아래 커넥션 풀 이슈 참고). 즉 이 테스트 스위트는 **직렬 실행을 전제로 설계**돼 있다.
- **`core.database.engine`은 모듈 임포트 시 1회만 생성되는 싱글턴인데 pytest-asyncio는 테스트마다 새 이벤트 루프를 쓴다.** 풀에 남은 커넥션이 이전 루프에 묶인 채로 다음 테스트에 재사용되면 "Future attached to a different loop" 에러가 난다. 이를 막기 위해 실 DB를 쓰는 모든 도메인(`memory, manuscript, timeline, worldbible, relationships, conflicts`)의 `conftest.py`가 토씨 하나 다르지 않게 동일한 `autouse` 픽스처를 반복 구현한다: `yield; await engine.dispose()`. 새 도메인에 실 DB 테스트를 추가하면서 이 픽스처를 빼먹으면 그 도메인의 두 번째 테스트부터 간헐적으로 실패한다.

반대로 `works`(서비스 유닛 테스트, `api/tests/works/conftest.py`)와 `auth`(`api/tests/auth/conftest.py`)는 **in-memory fake repository/Redis**로 완전히 DB 없이 돈다(`FakeWorksRepository`, `FakeAuthRepository`, `FakeRedis` — 딕셔너리 기반 스텁). 즉 같은 도메인 안에서도 "서비스 로직 유닛 테스트(fake)"와 "격리·isolation 통합 테스트(실 DB)"가 파일명으로 나뉘어 공존한다(`test_works_beat_sheet.py` 류는 fake, `test_works_isolation.py`는 실 DB).

`chat` 도메인은 실 LLM 대신 `ChatLiteLLM` 경계를 `unittest.mock.patch`로 가로채는 `FakeChatLiteLLM`/`StubLLMClient`(`api/tests/chat/_mocks.py`, `api/tests/chat/conftest.py`)로 네트워크 호출 없이 검증한다.

### 픽스처 구조

루트 `api/tests/conftest.py`: `settings_cache_clear`(autouse) — `get_settings()`의 `@lru_cache`를 매 테스트 전후로 비워 monkeypatch한 env 변수가 다음 테스트로 새지 않게 함. `_close_redis_between_tests`(autouse) — Redis 클라이언트 싱글턴을 테스트 후 close(엔진 dispose와 같은 이유, 다른 이벤트 루프 문제).

도메인별 `conftest.py`는 위 DB 정리 픽스처 외에, 라우트 테스트용 `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")` + `app.dependency_overrides[get_current_user] = lambda: user`로 인증을 우회하는 헬퍼(`_client_as`)를 도메인마다 반복 구현한다.

### 커버리지·검증 명령

```bash
task test         # pytest tests -v (--cov-fail-under=70 포함)
task test-unit     # -m unit
task test-integration  # -m integration (인프라 기동 필요)
task test-fast     # --no-cov (빠른 피드백)
task lint          # ruff check + mypy
```

커버리지 리포트: `term-missing` + HTML(`api/htmlcov/`, `task test-cov`로 자동 오픈). `[tool.coverage.run]`: `branch = true`, `omit = ["*/migrations/*", "*/alembic/*", "*/tests/*"]`.

`api/scripts/smoke_test.py`는 pytest 스위트가 아니라 **구동 중인 서버**를 대상으로 하는 별도 스크립트(`task smoke-test`) — 헬스체크부터 로그인까지 실 HTTP로 순회하며 실패 시 `exit 1`.
