<!-- forge-slug: auth-admin-cli -->
<!-- task: 23 -->
<!-- tdd: on -->
<!-- priority: high -->
# 회원 이메일 인증·관리자 권한 부여 CLI (api, task 실행)

운영자가 **이메일 링크 없이** 회원을 수동 인증하고 특정 회원에게 **admin 역할**을 부여할 수 있는 백엔드 CLI를 만든다. `task`로 실행하고 `api/README.md`에 사용법을 추가한다. (지금 dev에서 가입하면 "Email verification is required before login."으로 로그인이 막히는데 인증 수단이 없어 막혀 있던 것을 푸는 운영 도구다.)

용어 주의: 여기서 **"회원 인증" = 이메일 인증(`User.is_verified`)**이다. 글로서리의 [[계정 승인]](pending→approved, 운영자 허가)과는 다른 축이며 이 작업은 계정 승인을 다루지 않는다.

## 목표 / 비목표

- 목표: argparse 단일 스크립트 `api/scripts/manage.py`에 서브커맨드 둘 — `verify-email <email>`(해당 회원 `is_verified=true`), `grant-admin <email>`(`admin` 역할을 get-or-create 후 부여) — 을 만들고, `api/Taskfile.yml`에 `task`로 실행하는 태스크를 추가하며, `api/README.md`에 안내 섹션을 추가한다. 기존 auth repository를 재사용하고 멱등하게 동작한다.
- 비목표:
  - **권한(Permission) 매트릭스 시드 / 풀 RBAC 부트스트랩 금지.** admin 역할은 *이름*만 get-or-create하고 권한을 붙이지 않는다 — admin 권한 정의·게이팅은 후속 admin 도메인 작업(로드맵)에서. (역할 이름 기반: 향후 관리자 화면 게이팅용.)
  - 발견된 잠재 버그(역할·권한이 전혀 시드 안 돼 `require_permission("chat:write")`가 모두 403 날 수 있음)는 **이 작업에서 고치지 않는다** — run.md/후속 과제로 남긴다.
  - `revoke-admin`·`show`·`list` 등 추가 명령 안 만듦(요청된 둘만).
  - 인앱 관리자 프로비저닝용 admin **API 엔드포인트**는 안 만듦(CLI 전용).
  - 새 Alembic 마이그레이션 없음(`roles`/`user_roles` 테이블은 이미 존재 — 역할 행은 런타임 INSERT).

## 진실의 출처

- Glossary terms: [[관리자]](role `admin`)·[[회원]]은 기존 글로서리(branch `CONTEXT.md`)를 따른다. 신규 용어 추가 없음. "회원 인증"은 이메일 인증(is_verified)이며 [[계정 승인]]과 구분(이미 글로서리에 구분 명시됨).
- Related ADRs:
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0005-users-as-tenant-app-layer-scoping.md` — 사용자/테넌트·RBAC 스코핑.
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0007-frontend-session-token-handling.md` — `/me`에 role 미노출·관리자 게이팅 후속 설계(이 CLI가 백엔드 admin 역할 부여 수단을 제공).
- 코드 사실(확인됨): `auth_repository.py`에 `get_user_by_email`·`mark_user_verified(user_id)`·`get_role_by_name(name)`·`assign_role_to_user(user, role)` 존재. `get_or_create_role`은 **없음 → 추가**. CLI 프레임워크 의존성 없음 → stdlib argparse. 스크립트 패턴은 `scripts/export_openapi.py`(`sys.path`에 src 추가 후 import) 참고. async 세션은 `core/database.py` 재사용. RBAC 강제는 `security.py`의 `require_permission`/`User.has_permission`.
- Definition of Done: `task api:verify-email -- <email>`로 해당 회원이 `is_verified=true`가 되고, `task api:grant-admin -- <email>`로 해당 회원이 `admin` 역할을 갖는다(없으면 역할 생성). 멱등(이미 인증/이미 admin → 안내 후 정상 종료), 없는 이메일 → 에러 메시지 + 비정상 종료. `api/README.md`에 사용법이 있고, `task lint`(ruff+mypy)와 `task test`(pytest, 신규 테스트 포함)가 통과한다.

## 작업 조각

- [ ] S1. repository에 `get_or_create_role(name)` 추가 — completion criterion (test-first): 이름으로 역할을 조회하고 없으면 생성해 반환한다. pytest로 (a) 없을 때 생성·반환, (b) 있을 때 기존 반환을 검증(실패 테스트 먼저). `task lint` 통과.
- [ ] S2. CLI 스크립트 `api/scripts/manage.py` — completion criterion (test-first): argparse 서브커맨드 `verify-email`·`grant-admin`. 커맨드 로직을 **테스트 가능한 async 함수**(예: `verify_email_cmd(session, email)`, `grant_admin_cmd(session, email)`)로 두고 `main()`이 인자 파싱+세션 오픈+디스패치+commit+종료코드를 담당. 동작: 이메일로 사용자 조회→없으면 stderr 에러+exit 1; `verify-email`은 이미 인증이면 안내 후 exit 0, 아니면 `mark_user_verified`; `grant-admin`은 `get_or_create_role("admin")`→`assign_role_to_user`(이미 보유면 안내, 멱등). pytest로 두 함수의 성공/멱등/없는-이메일 경로를 테스트 DB로 검증(실패 테스트 먼저→통과).
- [ ] S3. `api/Taskfile.yml`에 태스크 추가 — completion criterion: `verify-email`·`grant-admin` 태스크가 `uv run python scripts/manage.py <sub> {{.CLI_ARGS}}`를 실행. 루트에서 `task api:verify-email -- <email>` / `task api:grant-admin -- <email>`로 호출되어 스크립트가 동작한다(인자 전달 확인).
- [ ] S4. `api/README.md`에 "관리자 CLI" 섹션 추가 — completion criterion: 두 명령의 목적(이메일 링크 없이 수동 인증/ admin 역할 부여)·사용법 예시(`task api:verify-email -- user@example.com` 등)·전제(DB 기동 필요)·계정 승인과의 구분을 문서화. Taskfile 명령어 목록에도 반영.
- [ ] S5. 검증 — completion criterion: 신규 pytest가 먼저 실패→구현 후 통과하고, `task lint`(ruff check + mypy strict)와 `task test`(pytest 전체)가 통과한다. 실패 시 출력·원인을 `run.md`에 남긴다. (depends: S1–S4)
