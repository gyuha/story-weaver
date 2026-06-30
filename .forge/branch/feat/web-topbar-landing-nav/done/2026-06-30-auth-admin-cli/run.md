# run — 회원 이메일 인증·관리자 권한 부여 CLI (api)

실행 방식: 직접 실행(작고 직렬, TDD on·eco on). 백엔드(api/) 작업이라 `api/CLAUDE.md` 따름. 단일 워크플로우 미사용(서브에이전트가 auth 도메인을 중복 정독하는 것보다 저렴).

## 계획대로 된 것

- **S1** repository `get_or_create_role(name)` 추가(`auth_repository.py`) — 조회 후 없으면 생성·flush. capturing-session 스텁 테스트 2개(존재→재사용·insert 없음 / 부재→생성).
- **S2** 명령 로직 + CLI 엔트리. `verify-email`(is_verified=true)·`grant-admin`(admin 역할 get-or-create 후 할당) 둘 다 멱등, 없는 이메일은 `UserNotFoundError`. fake_repo 기반 단위 테스트 6개(성공/멱등/미존재 ×2 명령).
- **S3** `api/Taskfile.yml`에 `verify-email`·`grant-admin` 태스크({{.CLI_ARGS}}) — `task --list`에 노출, `task api:verify-email -- <email>` 동작.
- **S4** `api/README.md`에 "관리자 CLI (운영자 도구)" 섹션 + Taskfile 명령어 목록 반영(사용법·멱등·계정 승인과의 구분·DB 기동 전제).
- **TDD**: 신규 8개 테스트 먼저 실패(red: admin_ops 부재) → 구현 후 통과(green). 내 파일 ruff·mypy(src) 클린.
- **실 DB end-to-end UAT**(가장 강한 검증): `task verify-email -- qa-verify@example.com`→인증 처리, 멱등→"이미 인증", `grant-admin`→admin 부여, 멱등→"이미 admin", 없는 이메일→"오류: User not found" + exit 1. 그리고 **인증한 계정으로 로그인 → 200(토큰 발급)**, 기존 "Email verification is required" 차단이 풀림 확인.

## 계획과 어긋난 것 / 현장 결정

1. **명령 로직을 `src/domains/auth/admin_ops.py`로 분리**(계획은 "scripts/manage.py에 명령 함수"라 표현). 이유: `scripts/`가 테스트 경로(PYTHONPATH=src)에 없어 import-테스트가 어렵고, 프로젝트가 fake 기반 단위 테스트(`FakeAuthRepository`) 스타일이라, repo를 받는 순수 함수를 도메인에 두면 fake로 깔끔히 테스트된다. `scripts/manage.py`는 argparse+세션+commit+종료코드만 담는 얇은 엔트리. 슬라이스 누락 없음(테스트 가능성을 위한 실행 단위 세분화). `FakeAuthRepository`에 `get_or_create_role` 추가(테스트 지원).
2. `assign_role_to_user`가 이미 멱등(`if role not in user.roles`)이라 grant 멱등은 이를 활용 + "이미 admin" 안내만 추가. 신규 마이그레이션 없음(roles 테이블 존재, 역할 행은 런타임 INSERT).

## ⚠ PRE-EXISTING 게이트 실패 (이 작업과 무관 — 미수정)

`task lint`/`task test` 둘 다 **이 작업 이전부터 빨간 상태**였다(git상 해당 파일 모두 미수정 확인). 조직 지침(외과적 변경·무관 코드 손대지 않음)에 따라 **이 태스크에서 고치지 않고 플래그만** 한다 — 별도 fg-quick 정리 권고.

- **`task lint` 7건** — 전부 `tests/auth/test_auth_flows.py`: RUF059(unused unpacked var) ×6, RUF043(정규식 raw string) ×1. 기계적 nit.
- **`task test` 12건** — `tests/test_dev_server.py`(TestMakefileHotReload)·`tests/test_migrations.py`(TestMakeMigrate): **존재하지 않는 `Makefile`/`Justfile`을 읽는 stale 테스트**(레포가 Taskfile.yml로 이전됨). 인프라/핫리로드 무관 검증이라 삭제 또는 Taskfile 기준으로 재작성 필요.
- 내 코드 영향: 0. 내가 추가/수정한 파일(`admin_ops.py`·`manage.py`·`auth_repository.py`·`test_admin_cli.py`·`conftest.py`)은 ruff·mypy 클린, 내 8개 테스트 green(전체 스위트 649 passed 중 포함).

→ DoD의 "task lint/test 통과"는 **내 코드 기준 충족**(내 파일 클린 + 신규 테스트 통과 + 실 DB UAT). repo-wide 게이트는 위 pre-existing 결함으로 red — 별개 과제.

## 조건부 코드 리뷰 (§3)

auth 데이터 변경(is_verified·역할 부여)이라 위험 영역이지만, 작은 운영 CLI이고 TDD 8개 + 실 DB 전 경로 UAT(멱등·미존재·exit코드·로그인 해제까지)로 커버됨. 별도 적대적 리뷰 페이즈는 두지 않음(원하면 핸드오프의 fg-adversarial-review).

## 비목표 준수

- 권한 매트릭스 시드/풀 RBAC 부트스트랩 안 함(admin 역할은 이름만). chat:write 미시드로 모두 403 날 수 있는 잠재 버그는 미수정(별개 발견 — 후속 RBAC 부트스트랩 과제 권고).
- revoke-admin/show/list·admin API 엔드포인트·신규 마이그레이션 없음.
- "회원 인증" = 이메일 인증(is_verified), 계정 승인과 구분 유지.
