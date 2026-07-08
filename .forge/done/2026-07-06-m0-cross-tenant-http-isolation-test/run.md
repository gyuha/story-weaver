# RUN — M0 잔여: 멀티테넌시 격리를 실 DB/HTTP 레벨로 검증

slug: m0-cross-tenant-http-isolation-test · task: 28 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

작업 규모가 아주 작아(통합 테스트 1개 파일) 워크플로우 없이 직접 처리.

## 계획대로 된 것

- **S1** `api/tests/works/test_works_isolation.py` 신설: 실 DB(`AsyncSessionFactory`) + 실 라우트(`works_router`, `get_current_user`만 override)로 계정 A가 만든 work를 계정 B로 GET/PATCH/DELETE 시도 → 3개 모두 404 확인. 삭제 시도가 실제로 지운 게 아니라 권한만 막았음을 소유자 재조회로 함께 증명.
- **S2** `task lint`(ruff+mypy)/`task test`(전체) 통과 — 신규 파일은 lint/mypy 에러 0건.

## 계획 대비 차이 (divergences)

1. **실 DB pytest 인프라가 전무했다** — 계획서는 "기존 conftest 패턴 재사용"을 가정했으나, 탐색 결과 `api/tests/` 전체가 fake repository/fake session만 쓰고 실 DB를 태우는 fixture가 하나도 없었다. 이 작업이 그 첫 사례라 `two_users`(실 유저 2명 생성+cascade 정리) fixture를 새로 만들었다.
2. **이벤트루프-연결풀 충돌을 발견·수정** — pytest-asyncio가 테스트마다 새 이벤트 루프를 쓰는데 `core.database.engine`은 모듈 임포트 시 1회만 생성돼 풀이 이전 루프에 묶인 커넥션을 들고 있다가 다음 테스트에서 깨짐(연결 3개 중 2번째 테스트가 에러). `_dispose_engine_pool`(autouse, 테스트 후 `engine.dispose()`) 추가로 해결. **M1 이후 백엔드 작업들도 실 DB 테스트를 쓰게 되면 이 패턴이 다시 필요할 가능성이 높음** — 반복되면 root conftest로 승격 후보.
3. 계획엔 없었지만 `task lint`(전체)가 `tests/auth/test_auth_flows.py`(RUF059/RUF043, 기존 코드)와 `tests/test_dev_server.py`/`test_migrations.py`(Makefile 관련, task 26 run.md에도 이미 "무관"으로 기록된 stale 테스트) 실패를 보고함 — 전부 이 작업 이전부터 있던 것으로 확인(내 신규 파일은 lint/mypy 0건, 무관한 실패 12건 제외하면 659 passed).

## 검증 (UAT)

- `cd api && .venv/bin/pytest tests/works/test_works_isolation.py -v --no-cov` → 3 passed.
- `.venv/bin/mypy tests/works/test_works_isolation.py` → no issues.
- `task test`(전체) → 659 passed, 1 skipped, 12 failed(전부 사전 존재·무관, 위 divergence 3 참고). `task lint` → ruff 7 errors(전부 test_auth_flows.py 기존 코드, 내 파일 무관).
- DoD 충족: 계정 A의 work를 계정 B 토큰으로 GET/PATCH/DELETE 시도 시 전부 404, 실 DB+실 라우트 경로로 확인됨.
