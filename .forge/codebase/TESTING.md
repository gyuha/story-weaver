---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# TESTING

StoryWeaver 모노레포의 테스트 프레임워크·구조·모킹·커버리지를 구현 사실 기준으로 기록한다. 비대칭이다: `api/`는 pytest 기반 테스트가 충실하고, `web/`는 테스트 인프라가 전혀 없다.

---

## 1. api/ (Python, pytest)

### 1.1 프레임워크·설정

설정: `api/pyproject.toml` `[tool.pytest.ini_options]` (라인 210~233).

- `asyncio_mode = "auto"` — async 테스트 함수를 `@pytest.mark.asyncio` 없이 자동 실행(pytest-asyncio).
- `testpaths = ["tests"]`, `pythonpath = ["src"]` — 테스트는 `from domains.auth.service import ...`처럼 `src` 기준으로 import.
- 발견 규칙: `python_files = ["test_*.py", "*_test.py"]`, `python_classes = ["Test*"]`, `python_functions = ["test_*"]`.
- `filterwarnings = ["error", ...]` — 경고를 에러로 취급(단 Deprecation/PendingDeprecation은 무시).
- `addopts`: `--strict-markers`(미정의 마커 거부), `--cov=src`, `--cov-report=term-missing`, `--cov-report=html:htmlcov`, `--cov-fail-under=70`.

의존성(`[dependency-groups] dev`): `pytest>=8.3`, `pytest-asyncio>=0.24`, `pytest-cov>=5.0`, `anyio>=4.6`, `httpx>=0.27`(AsyncClient), `fakeredis>=2.26`.

실행: `task test`(= pytest). 린트는 별도 `task lint`.

### 1.2 커버리지

설정: `[tool.coverage.run]` / `[tool.coverage.report]` (라인 238~256).

- `source = ["src"]`, `branch = true`(분기 커버리지).
- omit: `*/migrations/*`, `*/alembic/*`, `*/tests/*`.
- `--cov-fail-under=70` — 70% 미만이면 실패(하드 게이트). HTML 리포트는 `api/htmlcov/`.
- `exclude_lines`: `pragma: no cover`, `def __repr__`, `if TYPE_CHECKING:`, `raise NotImplementedError`, `...`.

### 1.3 디렉터리 구조

`api/tests/` 는 도메인별 하위 디렉터리로 미러링된다(소스 `src/domains/` 구조 반영).

```
api/tests/
├── conftest.py            # 루트 fixture (settings 캐시 격리)
├── __init__.py
├── test_main_runtime.py   # FastAPI app/lifespan/ready 엔드포인트
├── test_migrations.py     # @pytest.mark.unit
├── test_config.py
├── test_dev_server.py     # @pytest.mark.unit
├── auth/                  # 인증 도메인 테스트 (다수)
│   ├── conftest.py        # fake_redis, fake_repo, auth_service
│   ├── test_auth_flows.py # 주요 플로우 + 토큰 헬퍼
│   ├── test_*_route.py    # 라우트 레벨 (login/signup/refresh/...)
│   ├── test_*_schemas.py
│   ├── test_*_repository.py
│   └── test_signup_mailpit_integration.py
├── chat/                  # LLM 도메인 테스트
│   ├── conftest.py        # 15+ LLM fixture
│   ├── _mocks.py          # FakeChatLiteLLM, StubLLMClient (pytest 비수집 헬퍼)
│   ├── test_llm_client.py
│   ├── test_llm_factory.py
│   ├── test_provider_*.py
│   ├── test_di_container.py
│   └── test_ports.py
├── infra/llm/
│   └── test_provider_factory.py
└── shared/
    └── test_shared_domain.py
```

conftest.py는 3곳: `tests/conftest.py`, `tests/auth/conftest.py`, `tests/chat/conftest.py`.

### 1.4 마커 (unit / integration / e2e)

정의(`pyproject.toml`):
- `unit`: 순수 단위 테스트(I/O 없음)
- `integration`: DB/Redis를 치는 테스트
- `e2e`: 실행 중인 서버 대상 end-to-end

실제 적용 현황(구현 사실):
- `@pytest.mark.unit` — 일부 파일에서 사용(`test_dev_server.py`, `test_migrations.py`).
- `@pytest.mark.integration`, `@pytest.mark.e2e` — **정의돼 있으나 현재 적용된 테스트 파일은 없다.** 통합/E2E 시나리오는 실제 DB/Redis 대신 인메모리 fake로 대체돼 있다(아래 1.5).
- async 테스트는 `asyncio_mode="auto"` 덕에 대부분 명시 마커 없이 실행된다. `@pytest.mark.parametrize`는 provider 검증 등에서 다수 사용.

`--strict-markers`가 켜져 있으므로 새 마커는 반드시 `pyproject.toml`에 등록해야 한다.

### 1.5 모킹 / fixture 패턴

테스트는 실제 PostgreSQL/Redis/SMTP/LLM에 붙지 않고 **인메모리 fake / stub**로 대체하는 것이 일관된 패턴이다.

**루트 `tests/conftest.py`:**
- `settings_cache_clear`(autouse) — 매 테스트 전후 `get_settings.cache_clear()` 호출. monkeypatch한 env가 테스트 간 누수되는 것을 막는다.

**`tests/auth/conftest.py`:**
- `fake_redis` → `FakeRedis` 인스턴스. dict 기반 인메모리 Redis 스텁(`get`/`set`/`exists`/`delete`/`ping`), `expirations` dict로 TTL 검증 가능.
- `fake_repo` → `FakeAuthRepository`. `AuthRepository` 호환 인메모리 스텁. users/refresh_tokens/email_verifications 등을 dict로 보관, 엔티티는 `MagicMock`으로 생성, `transaction()`은 no-op 컨텍스트(진입/종료 횟수 카운트).
- `auth_service` → `AuthService(repo=fake_repo, redis=fake_redis)`.

`fakeredis` 패키지가 dev 의존성에 있으나, auth 테스트의 `FakeRedis`는 conftest에 직접 정의한 경량 스텁이다.

**`tests/chat/conftest.py` + `tests/chat/_mocks.py`:**
- env fixture(`env_openai`, `env_ollama`) — `monkeypatch.setenv`로 `LLM_PROVIDER`/모델/API 키 설정. 루트 `settings_cache_clear`와 결합해 provider 분기 테스트.
- settings fixture(`openai_llm_settings`, `ollama_llm_settings`) — env 없이 `LLMSettings` 객체 직접 구성.
- ChatLiteLLM patch fixture — `patch("infra.llm.provider_factory.ChatLiteLLM", ...)`로 LangChain 어댑터를 교체. `FakeChatLiteLLM`은 `ainvoke`/`astream`을 가짜 응답으로 구현하고 호출 횟수·마지막 인자·`init_kwargs`를 캡처(provider 라우팅 검증용).
- `StubLLMClient` — patch 없는 순수 클래스. `LLMClientProtocol`을 덕타이핑으로 만족, 가장 빠른 주입.
- ChatService fixture — `ChatService(llm_client=...)`로 stub/mock 주입.

**FastAPI 의존성 오버라이드(라우트 레벨, 예: `tests/auth/test_login_route.py`):**
- `FastAPI()` 인스턴스에 라우터를 include하고 `application.dependency_overrides[_get_service] = lambda: fake_service`로 서비스를 테스트 더블로 교체. 더블은 `.calls` 등 검사 속성을 갖는 커스텀 스텁.

**`tests/test_main_runtime.py`:**
- `monkeypatch.setattr`로 모듈 레벨 import(`core.database.engine`, `core.redis.get_redis_client`, `asyncio.open_connection`)를 fake로 교체해 `/ready` 엔드포인트를 실제 인프라 없이 테스트.

### 1.6 테스트 네이밍 / 헬퍼

- 파일: `test_<도메인>_<개념>.py` (예: `test_login_route.py`, `test_provider_mocks.py`).
- 클래스: `Test<개념>` (예: `TestSignup`, `TestLogin`). 라우트 테스트는 함수형도 혼용.
- 함수: `test_<동작>_<결과>` 서술형 (예: `test_signup_creates_user`, `test_login_rejects_malformed_payload_before_service_call`).
- fixture/헬퍼 네이밍은 제공물 기준(`auth_service`, `fake_repo`, `llm_client_openai`).
- 인증 헬퍼는 fixture가 아닌 모듈 레벨 함수: `_sign_test_token(payload)`(설정된 테스트 시크릿으로 JWT 서명), `_tamper_signature(token)`(서명만 변조). 이메일 서비스 fake는 `CapturingAuthEmailService`(전송 (email, token) 쌍 기록, 실패 주입 지원). 사용자 생성은 `FakeAuthRepository.create_user`가 팩토리 역할.

---

## 2. web/ (TypeScript / React)

### 2.1 현황 — 테스트 없음

`web/`에는 **테스트 파일도, 테스트 러너도, 테스트 의존성도 전혀 없다.** (구현 사실, 직접 확인)

확인 근거:
- `web/` 전체(`node_modules` 제외)에 `*.test.*` / `*.spec.*` 파일 0개. `__tests__` 디렉터리 없음.
- `web/package.json`에 `vitest`/`jest`/`@testing-library/*`/`playwright`/`cypress` 의존성 없음. `test` 계열 스크립트 없음(존재 스크립트: `generate`, `dev`, `build`, `preview`, `typecheck`, `lint`, `lint:fix`, `format`).
- `web/vite.config.ts`에 Vitest 설정 없음(플러그인은 `tanstackRouter`, `react`, `tailwindcss`, `tsconfigPaths`뿐).
- 루트/프로젝트 어디에도 `vitest.config.*` / `jest.config.*` 없음.

### 2.2 현재 web의 품질 게이트

테스트 대신 다음이 품질 검증 수단이다:
- `pnpm typecheck` (`tsc --noEmit`) — 타입 검증.
- `pnpm lint` (`biome check .`) — biome 린트.
- `pnpm build` (`tsc -b && vite build`) — 타입 빌드 + 번들.

웹에 자동화 테스트를 추가하려면 러너(예: Vitest) + 설정 + 스크립트를 새로 도입해야 한다. 현재 기준점은 0이다.

---

## 부록 — 주요 파일

- `api/pyproject.toml` — pytest / coverage 설정 (`--cov-fail-under=70`)
- `api/tests/conftest.py` — 루트 fixture (settings 캐시 격리)
- `api/tests/auth/conftest.py` — `fake_redis`, `fake_repo`, `auth_service`
- `api/tests/chat/conftest.py` — LLM provider fixture
- `api/tests/chat/_mocks.py` — `FakeChatLiteLLM`, `StubLLMClient`
- `web/package.json` — 테스트 스크립트/의존성 부재 확인 지점
- `web/vite.config.ts` — Vitest 미설정 확인 지점
