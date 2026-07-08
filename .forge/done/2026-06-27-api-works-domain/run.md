# run — API 작업 1: works 도메인 + 계약 파이프라인

slug: api-works-domain · 실행일: 2026-06-27 · 워크플로우: 미사용(직접 실행, TDD on)

## 실행 방식

슬라이스 직렬 의존 + 기반 템플릿(컨벤션 정확성 중요) + eco → 워크플로우 대신 직접 실행. auth 도메인 컨벤션은 Explore 에이전트로 추출해 그에 맞춰 구현. 테스트는 auth 패턴(in-memory fake / fake 세션 / 의존성 override)을 따라 실 DB 없이 작성.

## 계획대로 된 것

- **슬라이스 1** — `src/domains/works/`(models·schemas·repository·service·router) auth 구조 미러. `Work` 모델(user_id FK→users, 프론트 `Work` 필드: short_label·sub_genre·keywords[]·status·cover_theme 등). 마이그레이션 `0002_works`(base→0001→0002 체인 유효). `alembic/env.py`에 works 모델 import 추가. ruff·mypy 통과.
- **슬라이스 2** — works CRUD(`GET/POST /api/v1/works`, `GET/PATCH/DELETE /api/v1/works/{id}`), 전부 `get_current_user` 스코프. 멀티테넌시: `get_owned` 헬퍼(소유 작품 or None→NotFoundError 404), 교차 테넌트 격리 테스트. 응답=Work 자기필드 + 파생 stats/reviewSummary(0)·lastEditedLabel, camelCase alias(프론트 계약). main.py 라우터 등록. TDD: 22개 테스트(service·repository·route) 통과.
- **슬라이스 3** — openapi 익스포트 `scripts/export_openapi.py` + Taskfile `openapi` task → 루트 `docs/openapi.json` 생성(works 경로 포함). web `openapi-ts.config.ts` input `../docs/openapi.json`로 통일. `pnpm generate`로 works 타입 생성 + web `pnpm typecheck` 통과. `docs/data-model.md` accounts→users 갱신(테이블/FK/mermaid).

## 계획과 다른 것 (divergence — 중간)

- **`task migrate` 라이브 적용** — 최초 실행 시 Docker 미기동으로 오프라인 검증만 했으나, 이후 인프라 기동(`task infra`) 후 라이브 적용·롤백 왕복까지 확인 완료(works 테이블 생성, downgrade 제거·upgrade 재생성, head=0002_works). **미검증 항목 없음.**
- works 테이블 필드를 data-model.md 최소 명세보다 **프론트 목업 `Work`에 맞춰 확장**(short_label·sub_genre·keywords·status·cover_theme). data-model.md도 함께 갱신해 정합.
- `AuthUser.role`에 ADMIN이 이미 있던 것처럼, `accounts`는 코드엔 없고 data-model.md 문서에만 있던 설계 — 실제 구현은 users로 통합(ADR-0005대로).
- 익스포트 스크립트가 `src`를 sys.path에 추가해야 `main` import 가능(PYTHONPATH=src 미설정 실행 경로 대응).
- **선존(무관) 실패**: `tests/test_dev_server.py`·`test_migrations.py` 12건은 존재하지 않는 `Makefile`을 읽어 실패(프로젝트가 Taskfile/Justfile로 이전). 내 변경과 무관, 범위 밖이라 미수정. `tests/auth/test_auth_flows.py`의 ruff 경고 7건도 선존.

## 검증 (UAT)

- `uv run pytest -q` → **637 passed, 1 skipped** (works 22 포함), 커버리지 **74%** (게이트 70% 통과). 선존 Makefile 테스트 12건 실패는 무관.
- `uv run mypy src` → Success(59 files). 내 파일 ruff 전부 통과.
- `uv run alembic history` → base→0001→0002(head) 체인 유효.
- `task openapi` → `docs/openapi.json`에 `/api/v1/works`·`/api/v1/works/{work_id}` 포함. `pnpm generate` → works 타입 생성, web `pnpm typecheck` 통과.
- 멀티테넌시 격리: 서비스/라우트 테스트로 교차 테넌트 접근 404, 인증 누락 422/401 확인.
- `task infra`(PG·Redis·Mailpit healthy) + `task migrate` 라이브 적용 → `works` 테이블 생성(컬럼·FK users CASCADE·인덱스 ix_works_user_id). `alembic downgrade -1`로 제거 → `upgrade head` 재생성, 최종 head=0002_works. **롤백 왕복 확인, 미검증 항목 없음.**
