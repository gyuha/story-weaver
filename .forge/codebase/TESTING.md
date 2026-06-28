---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-26
---

# 테스트

StoryWeaver monorepo의 실제 테스트 설정. 존재하지 않는 테스트는 적지 않는다.

## web — 테스트 러너 없음

web에는 **테스트 러너가 설치돼 있지 않다**. 확인 근거:

- `web/package.json`의 dependencies/devDependencies에 `vitest`, `jest`, `@testing-library/*`, `playwright`가 **없다**.
- `web/package.json`의 `scripts`에 `test` 스크립트가 **없다**(`dev`, `build`, `preview`, `typecheck`, `lint`, `lint:fix`, `format`, `generate`만 존재).
- 저장소 web 트리에 `*.test.*`, `*.spec.*`, `vitest.config.*`, `jest.config.*` 파일이 **없다**(검색 결과 0건).

검증 수단은 정적 검사뿐이다:

- `pnpm typecheck` = `tsc --noEmit` — 타입 검증. 타입드 라우트(`to`/`params`)의 유효성도 여기서 확인.
- `pnpm lint` = `biome check .` — Biome 린트·포맷 검사.

UI 렌더링·동작의 수동 확인은 playwriter MCP(`mcp__playwriter_latest__execute`)로 `http://localhost:3000`을 띄워 눈으로 본다(자동화 테스트가 아니라 수동 확인 수단, `CLAUDE.md` 명시).

커버리지 측정 없음.

## api — pytest

api는 pytest 기반의 실제 테스트 스위트를 갖는다.

### 프레임워크·의존성

`api/pyproject.toml`의 `[dependency-groups].dev`:

- `pytest>=8.3.0`
- `pytest-asyncio>=0.24.0` — async 테스트
- `pytest-cov>=5.0.0` — 커버리지
- `anyio>=4.6.0` — async 헬퍼
- `httpx>=0.27.0` — `AsyncClient`(ASGI TestClient)
- `fakeredis>=2.26.0` — 인메모리 Redis 스텁

### pytest 설정 (`[tool.pytest.ini_options]`)

- `asyncio_mode = "auto"` — async 테스트에 데코레이터 불필요(테스트가 그냥 `async def`).
- `testpaths = ["tests"]`, `pythonpath = ["src"]`.
- 파일 패턴: `python_files = ["test_*.py", "*_test.py"]`, 클래스 `Test*`, 함수 `test_*`.
- `filterwarnings = ["error", "ignore::DeprecationWarning", "ignore::PendingDeprecationWarning"]` — 경고를 에러로 승격(일부 제외).
- `addopts`: `--strict-markers`, `--cov=src`, `--cov-report=term-missing`, `--cov-report=html:htmlcov`, **`--cov-fail-under=70`** — 커버리지 70% 미만이면 실패.
- 마커: `unit`(I/O 없는 순수 단위), `integration`(DB/Redis 사용), `e2e`(구동 중 서버 대상).

### 커버리지 (`[tool.coverage.*]`)

- `source = ["src"]`, `branch = true`.
- omit: `*/migrations/*`, `*/alembic/*`, `*/tests/*`.
- exclude_lines: `pragma: no cover`, `def __repr__`, `if TYPE_CHECKING:`, `raise NotImplementedError`, `...`.
- HTML 리포트 출력 위치: `api/htmlcov/`.

### 테스트 디렉터리 구조

`api/tests/` 아래 도메인별로 분리(`api/src/domains/` 구조 미러링). 관찰된 파일(`test_*.py` 29개):

- 루트: `api/tests/conftest.py`, `api/tests/test_main_runtime.py`, `api/tests/test_migrations.py`, `api/tests/test_config.py`, `api/tests/test_dev_server.py`
- `api/tests/auth/` — `conftest.py` + 다수(`test_login_route.py`, `test_signup_route.py`, `test_refresh_route.py`, `test_password_reset_route.py`, `test_auth_flows.py`, `test_login_schemas.py`, `test_signup_schemas.py`, `test_refresh_repository.py`, `test_signup_password_hashing.py`, `test_signup_mailpit_integration.py` 등). route / schema / repository / flow / integration 계층별 분리가 파일명에 드러남.
- `api/tests/chat/` — `conftest.py` + `test_llm_client.py`, `test_llm_factory.py`, `test_provider_mocks.py`, `test_provider_routing.py`, `test_api_provider_switching.py`, `test_ports.py`, `test_di_container.py`
- `api/tests/shared/` — `test_shared_domain.py`
- `api/tests/infra/llm/` — `test_provider_factory.py`

별도로 `api/scripts/smoke_test.py` — 구동 중인 FastAPI 서버 대상 HTTP 스모크 테스트(헬스체크 → 회원가입 → 이메일 인증 → 로그인 → 보호 엔드포인트 → 토큰 갱신 → 로그아웃 순). pytest 스위트가 아니라 독립 실행 스크립트(실패 시 exit 1).

### 픽스처·모킹 방식

기준 파일: `api/tests/conftest.py`, `api/tests/auth/test_login_route.py`.

- 루트 conftest는 `settings_cache_clear` 픽스처(`autouse=True`)로 `get_settings`의 `@lru_cache`를 매 테스트 전후로 비워 monkeypatch한 env가 누설되지 않게 한다.
- 라우트 테스트는 FastAPI 인스턴스를 테스트 안에서 만들고(`FastAPI()` + `include_router(router, prefix="/api/v1")`), `application.dependency_overrides[_get_service] = lambda: fake_service`로 DI를 가짜 서비스로 치환한다.
- 서비스 가짜는 클래스로 작성(예: `FakeLoginService` — 호출 기록 `calls` 리스트 보관, 시나리오 플래그로 분기).
- HTTP 호출은 `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")`로 인-프로세스 ASGI 요청. 네트워크 미사용.
- Redis 의존은 `fakeredis`로 대체.
- `@pytest.mark.parametrize`로 입력 변형 다수 검증(malformed payload, 잘못된 자격증명 등).
- 모듈 상단 `from __future__ import annotations`, 모든 픽스처/테스트에 타입 힌트.

### 명령어 (`api/Taskfile.yml`, `api/CLAUDE.md`)

```bash
task test     # pytest (커버리지 포함, --cov-fail-under=70)
task lint     # ruff check + mypy
task format   # ruff format + ruff check --fix
```
