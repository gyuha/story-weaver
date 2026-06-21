---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# TESTING — 검증·테스트 접근

## 핵심 사실: web에는 테스트 러너가 없다

`web/`에는 vitest·jest 등 단위/통합 테스트 러너가 **설정되어 있지 않다**. `web/package.json`의 `scripts`에 `test` 항목이 없고, `dependencies`/`devDependencies`에 어떤 테스트 프레임워크도 없다(`vitest`, `jest`, `@testing-library/*`, `playwright` 패키지 자체도 미설치). `src/` 안에 `*.test.ts(x)`/`*.spec.ts(x)` 파일도 없다.

따라서 web의 "검증"은 자동화된 테스트 통과가 아니라 아래 정적 검사 + 빌드 + 수동 브라우저 확인의 조합으로 이뤄진다.

## web 검증 절차

표준 게이트(커밋 전 기본):

1. `pnpm typecheck` (`tsc --noEmit`) → 타입 오류 0 확인. 라우트 `to`/`params` 타입까지 컴파일 타임에 검증됨.
2. `pnpm lint` (`biome check .`) → 포맷·린트 위반 0 확인. 자동 수정은 `pnpm lint:fix`.
3. `pnpm build` (`tsc -b && vite build`) → 프로덕션 빌드 성공 확인.

검증 명령 정의 위치: `web/package.json` scripts. `web/Taskfile.yml`에도 동일 작업이 래핑돼 있을 수 있다(루트 `Taskfile.yml`/`web/Taskfile.yml` 참조).

수동 브라우저 확인(렌더링·인터랙션처럼 정적 분석으로 단정 불가한 항목):

- `pnpm dev`로 Vite dev 서버를 띄우고(포트 3000, `web/vite.config.ts`) `http://localhost:3000`을 연다.
- 프로젝트 규칙상 UI 변경의 실제 렌더링·동작 확인은 **playwriter MCP**(`mcp__playwriter_latest__execute`)로 브라우저를 띄워 확인한다. "버튼이 보이는지", "내비게이션이 동작하는지" 같은 것은 추측하지 말고 직접 확인할 것(루트 `CLAUDE.md`).
- 풀스택 동작 확인 시 백엔드 포트 주의: Vite 프록시는 `/api` → `http://localhost:8080`으로 rewrite하지만 `api/README.md`의 dev 기본 포트는 `:8000`이라 불일치가 있다. 로컬에서 프록시 타깃과 실제 API 포트를 일치시켜야 한다.

현재 화면 대부분이 mock 시드 데이터(`features/*/mock/`)를 Zustand 스토어에 채워 동작하므로, 브라우저 확인은 실 백엔드 없이도 가능하다.

## 검증 흐름

```
코드 변경 → pnpm typecheck → pnpm lint → pnpm build → playwriter로 브라우저 확인
                  ↓ 실패            ↓ 실패         ↓ 실패
               타입 수정         포맷/규칙 수정    빌드 오류 수정
```

## api 쪽 (참고)

`web`과 달리 `api/`(FastAPI 백엔드)에는 정식 테스트 스위트가 있다.

- 러너: `pytest` (+ `pytest-asyncio`, `pytest-cov`, `anyio`, `httpx`, `fakeredis`) — `api/pyproject.toml`의 dev 의존성.
- 테스트 위치: `api/tests/`(`testpaths = ["tests"]`). 예: `tests/test_main_runtime.py`, `tests/test_migrations.py`, `tests/test_config.py`, `tests/chat/test_llm_client.py`, `tests/chat/test_provider_routing.py` 등. 스모크 테스트는 `api/scripts/smoke_test.py`.
- 마커 분류: `unit`(순수 단위, I/O 없음), `integration`(DB/Redis 필요), `e2e`(구동 중인 서버 대상).
- 명령(`api/Taskfile.yml`): `task test`(`uv run pytest tests -v`, 커버리지 포함), `task test-unit`(`-m unit`), `task test-integration`(`-m integration`), `task test-cov`.
- 품질 게이트: ruff(린트+포맷), mypy(strict), pytest (`api/CLAUDE.md`). 커버리지 산출물은 `api/htmlcov/`에 존재.
- 백엔드 작업 시 상세는 `api/CLAUDE.md`를 우선 참조할 것.

## 요약

- web: **자동 테스트 없음.** 검증 = `pnpm typecheck` + `pnpm lint` + `pnpm build` + playwriter MCP 수동 확인.
- api: pytest 기반 테스트 존재(`uv run pytest`, unit/integration/e2e 마커) + ruff + mypy strict.
- web에 테스트를 새로 도입한다면 러너·설정·스크립트를 처음부터 추가해야 한다(현재 전제 없음).
