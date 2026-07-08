<!-- forge-slug: api-works-domain --><!-- task: 19 --><!-- tdd: on -->

# API 작업 1 — works(작품) 도메인 + 계약 파이프라인 복구

## Goal

프론트 목업에 맞는 백엔드 API 구축의 첫 수직 슬라이스. 소유 루트인 **works(작품)** 도메인을 끝까지(model·migration·repository·service·router·테스트) 구현하고, 멀티테넌시 스코핑·openapi 계약 파이프라인·테스트 패턴의 **템플릿**을 확립한다. 이후 모든 도메인이 이 위에서 구현된다.

## 전체 로드맵 (맥락 — 이 작업은 1단계)

도메인별 수직 슬라이스로 차근차근 구현: **works(이번)** → world-bible(entities) → scenes/chapters(원고) → timeline → memory(벡터) → settings → admin. 각 후속 도메인은 자체 fg-ask→구현 루프로 진행. 프론트 배선·pgvector·RLS·계정 승인 실제 강제는 별도 단계.

## Source of truth (glossary·decisions)

- **작품 (Work)** — `.forge/CONTEXT.md`. 최상위 소유 단위.
- ADR-0005 (테넌트 루트=users, 앱 레이어 스코핑 now + RLS 후속) — `.forge/branch/feat/web-topbar-landing-nav/adr/0005-*`.
- ADR-0006 (code-first openapi 계약 파이프라인, 루트 `docs/openapi.json`) — 같은 위치 `0006-*`.
- 데이터 모델: `docs/data-model.md`(단, `accounts`→`users`로 갱신 대상).
- 목업 계약: `web/src/features/shared/types.ts`의 `Work`/`WorkStats`/`NewWorkInput`, `web/src/features/shared/store/works.store.ts`(addWork 기본값).
- 기존 규약: `api/CLAUDE.md`(DDD·src layout·mypy strict·ruff·pytest 70%), `api/src/main.py` 라우터 등록(prefix `/api/v1`), `api/src/domains/auth`(인증 의존성·User 모델·패턴 참고).

## Decisions

- 테넌트 루트 = `users`, 격리 = 앱 레이어 스코핑(교차 테넌트 404) — ADR-0005.
- API 계약 = code-first, openapi 익스포트 → 프론트 generate, 경로 루트 `docs/openapi.json` — ADR-0006.
- works 엔드포인트는 **작품 메타데이터만** 다룬다. 중첩 컬렉션(chapters·entities·timeline·conflicts)은 각 도메인 엔드포인트 소관 — works 응답에서 제외.
- `stats`/`reviewSummary`는 파생(derived) 읽기 모델. 챕터·씬 도메인 부재로 현재는 0/기본값을 계산해 반환(응답 shape는 프론트 `Work`와 호환 유지).

## Slices

### 1. works 도메인 스캐폴드 + 모델 + 마이그레이션

- `src/domains/works/`에 `models/works_models.py`(`Work`: id·user_id FK→users·title·genre·sub_genre·keywords·style·status·cover_theme·short_label·created_at·updated_at), `schemas/`, `repository/`, `service/`, `router/` 골격(auth 도메인 구조 미러).
- Alembic 마이그레이션 `0002_works`(works 테이블, `user_id` FK·인덱스). autogenerate SQL 리뷰.
- **완료 기준**: `task migrate`가 깨끗이 적용·롤백. `task lint`(ruff+mypy strict) 통과.

### 2. works CRUD 엔드포인트 (TDD)

- 테스트 우선: 각 엔드포인트의 완료 기준을 핀하는 실패 테스트 작성 후 구현.
- 엔드포인트(라우터 prefix `/works`, main.py에 `/api/v1` 등록): `GET /api/v1/works`(내 작품 목록), `POST /api/v1/works`(`NewWorkInput`: title·genre·keywords·style → 기본값 shortLabel 파생·sub_genre=keywords[0]??genre·status='구상'·cover_theme='dark'), `GET/PATCH/DELETE /api/v1/works/{id}`.
- 전부 `get_current_user` 스코프. 응답 = Work 자기 필드 + 파생 `stats`(0)·`reviewSummary`(0), 중첩 컬렉션 제외.
- 멀티테넌시: 소유권 헬퍼(소유 작품 조회 or 404) 확립 — 이후 도메인 재사용.
- **완료 기준**: pytest로 CRUD 동작 + 인증 필수(401) + 교차 테넌트 격리(타 사용자 work 접근 404) 검증. 커버리지 70% 게이트 유지(`task test`).

### 3. openapi 계약 파이프라인 복구 + data-model 갱신

- api에 openapi 익스포트(`task openapi:export` 류): FastAPI `/openapi.json` → 루트 `docs/openapi.json` 덤프.
- web `openapi-ts.config.ts` input을 `../docs/openapi.json`으로 변경. `pnpm generate` 1회 실행해 works 엔드포인트 타입이 `web/src/api`에 생성됨을 확인.
- `docs/data-model.md`의 `accounts`→`users` 반영(ADR-0005).
- **완료 기준**: `pnpm generate`가 새 `docs/openapi.json`에서 works 타입을 생성(web `pnpm typecheck` 통과). data-model.md에 accounts 잔존 없음.

## Non-goals (이번에 안 함)

- 다른 도메인 전부(world-bible·scenes·timeline·memory·settings·admin)
- 프론트 mock-store → 실제 API 배선 (인증 배선 선행 필요)
- pgvector/임베딩, 메모리 검색
- PostgreSQL RLS (후속 방어 심층)
- 계정 승인 실제 강제(admin 도메인)
- 부(Part) 계층 표현 결정 (scenes 도메인 fg-ask에서)
- works 중첩 컬렉션 엔드포인트(각 도메인 소관)
