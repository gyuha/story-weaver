<!-- forge-slug: m0-cross-tenant-http-isolation-test -->
<!-- task: 28 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M0 잔여 — 멀티테넌시 격리를 실 DB/HTTP 레벨로 검증

`works` 도메인의 멀티테넌시 격리(계정 A가 계정 B의 작품에 접근 불가)는 현재 서비스 레이어 단위 테스트(fake repository)로만 검증되고 있다. 실 DB + 실 HTTP 라우트를 거치는 통합 테스트를 추가해 로드맵 M0의 격리 검증 기준(architecture.md 6.2 "격리 불변식을 테스트로 강제")을 실제로 충족시킨다.

## 목표 / 비목표

- 목표: `GET/PATCH/DELETE /api/v1/works/{work_id}`에 대해, 계정 A가 만든 work를 계정 B의 토큰으로 접근하면 404(NotFoundError 매핑)를 반환함을 실 DB(테스트 DB) + 실 라우트로 검증하는 통합 테스트 추가.
- 비목표: works 외 다른 도메인(entity 등)의 격리 테스트 — 해당 도메인이 아직 없으므로 각자의 M1 작업에서 함께 다룬다. 격리 구현 방식(row-level vs RLS) 변경 — 현재 방식(user_id FK + 서비스 레이어 소유권 체크) 유지.

## 진실의 출처

- Glossary terms: 없음.
- Related ADRs: `.forge/adr/0005-users-as-tenant-app-layer-scoping.md`(테넌트 루트=users).
- 코드 사실: `api/tests/works/test_works_service.py`에 fake repo 기반 cross-tenant 테스트(66-108줄) 존재하나 실 DB/라우트 통합 테스트는 없음. `api/tests/works/test_works_route.py`는 `FakeWorksService`로 서비스 자체를 mocking.
- Definition of Done: 실 DB(conftest의 테스트 DB 픽스처)를 쓰는 통합 테스트에서, 계정 A가 만든 work를 계정 B의 access token으로 조회/수정/삭제 시도 → 전부 404. `task test`(api) 통과.

## 작업 조각

- [ ] S1. 통합 테스트 추가 (TDD) — completion criterion: `api/tests/works/test_works_route.py` 또는 신규 `test_works_isolation.py`에, 실 DB 세션 픽스처(기존 conftest 패턴 재사용) + 실 라우트(TestClient/httpx AsyncClient)로 계정 A 작품에 계정 B 토큰 접근 시 3개 엔드포인트(GET/PATCH/DELETE) 모두 404 확인하는 테스트 작성 → 통과.
- [ ] S2. 검증 — completion criterion: `cd api && task lint && task test` 통과, 신규 테스트가 실 DB 경로를 타는지 확인(fake repo 미사용).
