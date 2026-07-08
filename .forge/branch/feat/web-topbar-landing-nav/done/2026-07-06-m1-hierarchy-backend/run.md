# RUN — M1: 계층(시놉시스·부·챕터·씬) 백엔드

slug: m1-hierarchy-backend · task: 29 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입): Schema(S1, TDD) → CRUD 병렬(S2 시놉시스·S3 부/챕터/씬) → Isolation(S4). S5(계약 재생성·검증)는 직접 수행.

## 계획대로 된 것

- **S1**: 신규 `manuscript` 도메인(`api/src/domains/manuscript/`) — `Synopsis`/`Episode`/`Chapter`/`Scene` 모델, 마이그레이션 `0004_manuscript_hierarchy`(FK cascade 전부 정확, synopses.work_id UNIQUE, 인덱스). works 모델 import 없이 `work_id: UUID`만 사용(도메인 경계 규칙 준수).
- **S2**: 시놉시스 GET/PUT(upsert) — `WorksService.get_work`를 소유권 헬퍼로 재사용(ADR-0005 취지와 일치).
- **S3**: 부/챕터/씬 15개 엔드포인트, `global_seq`는 작품 전역 max+1(계획대로 단순 구현, 재계산 최적화는 비목표 유지). 소유권 체인(work→episode→chapter→scene) 검증.
- **S4**: 부/챕터/씬의 PATCH/DELETE cross-tenant 404 커버리지 갭을 발견해 보강(`test_manuscript_isolation.py` 6건 추가) — GET은 S2/S3가 이미 실DB로 커버해 중복 작성하지 않음.
- **S5**(직접): `task contract` 재추출 — `docs/openapi.json`에 새 8개 경로 전부 반영 확인, `pnpm generate`로 웹 SDK 재생성, `pnpm typecheck`/`lint`/`test` 웹 쪽 회귀 없음 확인.

## 계획 대비 차이 (divergences)

1. **소유권 헬퍼 재사용 패턴을 에이전트들이 자체적으로 합의** — 계획서엔 "works 패턴 재사용"이라고만 적었는데, S2가 `WorksService.get_work`를 직접 의존성으로 주입해 재사용하는 구체 방식을 정하고(Work 모델 import 없이), S3가 이를 그대로 따랐다. 설계 이탈이 아니라 계획이 비워둔 디테일을 합리적으로 메운 것.
2. **도메인 이름을 `manuscript`로 자체 결정** — 계획서는 이름을 위임했고, 부/챕터/씬이 "집필 원고" 개념과 맞아 CONTEXT.md 글로서리와도 충돌 없음. 문제 없음.
3. **자동 생성된 마이그레이션에서 무관한 기존 drift 발견** — `email_verifications`/`password_resets`/`refresh_tokens`의 index-vs-unique-constraint 불일치, `works`의 server_default drift. 이번 마이그레이션에서 제외(범위 밖), 후속 정리 후보로 기록.
4. **repository/service/router/schemas를 S1에서 스캐폴딩하지 않음(models만)** — YAGNI 판단으로 S2가 실제 로직과 함께 만듦. 최종 결과물엔 영향 없음.

## 알려진 한계 / 후속 후보

- 자동 생성 마이그레이션이 드러낸 기존 스키마 drift(위 divergence 3) — 별도 정리 작업 후보.
- `next_global_seq`는 락 없는 단순 max+1 읽기(동시 씬 생성 시 race 가능성) — 계획의 명시적 비목표, 필요해지면 후속.

## 검증 (UAT)

- api: `task lint`(ruff+mypy strict) — 신규 코드 0 에러, 기존 `test_auth_flows.py` 7건만 무관하게 남음. `task test` — 684 passed, 1 skipped, 12 failed(전부 Makefile 참조 stale 테스트, task 26/28에서도 무관 확인된 동일 베이스라인).
- 마이그레이션 SQL 직접 리뷰(api/CLAUDE.md 규칙): FK cascade·unique·인덱스·up/down 순서 전부 정확 확인.
- 계약: `task contract` → openapi.json에 8개 신규 경로(`synopsis`, `episodes`×2, `chapters`×2, `scenes`×2) 확인. web: `pnpm typecheck`/`lint`/`test`(45 tests) 통과 — 회귀 없음.
- DoD 충족: 작품에 시놉시스 1개, 부/챕터/씬 CRUD 가능, 씬이 전역 순서(`global_seq`)를 가짐. cross-tenant 접근 4종 리소스 전부 404 확인.
