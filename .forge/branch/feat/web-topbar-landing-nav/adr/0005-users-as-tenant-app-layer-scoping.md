# 테넌트 루트 = users, 멀티테넌시 격리 = 앱 레이어 스코핑 (RLS 후속)

API 도메인을 본격 구현하면서 모든 도메인 테이블의 소유(테넌트) 루트와 격리 방식을 확정해야 한다. 두 가지 기존 자산이 충돌한다: `docs/data-model.md`는 별도 `accounts`(id·email·created_at) 테이블을 테넌트 루트로 두고 `works.account_id → accounts`로 설계했으나, 구현된 auth 도메인은 이미 `users` 테이블(email·display_name·roles·is_active·is_verified 완비)을 가진다. 둘은 같은 사람을 가리킨다. 또한 data-model.md는 격리 방식(PostgreSQL RLS vs row-level WHERE)을 **미결정**으로 남겼다.

## Considered Options

### 소유 루트
- **`users`를 테넌트 루트로 통합 (채택)** — 별도 `accounts` 미도입. `works.user_id → users.id`. data-model.md의 `accounts`는 `users`로 대체한다. CONTEXT 글로서리상 회원=계정=사용자(동일인)이고, 한 계정에 여러 사용자(팀/조직) 요구가 PRD에 없다(단일 작가 모델). `accounts`는 email을 `users`와 중복시키고 조인만 늘린다.
- **`accounts` 별도 유지** — 인증 정체성(users)과 테넌트/과금(accounts)을 분리. 향후 팀·조직·과금 주체 분리엔 유리하나 지금은 불필요한 indirection. 도입하려면 별도 ADR로 재설계.

### 격리 enforcement
- **앱 레이어 스코핑 now + RLS 후속 (채택)** — `get_current_user` 기준으로 repository/service의 모든 쿼리를 소유권으로 필터한다. `works`는 `WHERE user_id = :me`, 하위 리소스(entities·scenes 등)는 `work_id`의 소유 작품이 내 것인지 검증(공용 소유권 헬퍼). 교차 테넌트 접근은 404. 단순·명시적·pytest로 핀 박기 쉽다.
- **PostgreSQL RLS now** — DB가 정책으로 강제(요청마다 세션 GUC로 테넌트 설정). 방어 심층엔 강하나 async 세션 GUC 배선·로컬 테스트 복잡도가 크다. MVP엔 과하다.

## Consequences

- 모든 도메인 테이블은 data-model.md 불변식대로 `work_id`(works는 `user_id`)를 직접 보유한다 — 이 컬럼은 앱 스코핑의 근거이자, 후속 RLS 도입 시에도 정책의 공통 근거가 된다.
- `accounts` 시장(팀/조직/과금 주체 분리)을 지금은 포기한다. 필요해지면 `users`↔`accounts` 분리를 별도 ADR로 재설계한다.
- `docs/data-model.md`를 `accounts → users`로 갱신한다(works 도메인 작업의 일부).
- RLS는 방어 심층으로 후속에 추가한다 — 그때까지 격리의 단일 보증은 앱 레이어 스코핑 + 격리 테스트다. 따라서 **교차 테넌트 격리 테스트는 모든 도메인의 필수 완료 기준**이다.
- 멱등한 소유권 헬퍼(소유 작품 조회 또는 404)를 works 도메인에서 확립해 이후 모든 하위 도메인이 재사용한다.
