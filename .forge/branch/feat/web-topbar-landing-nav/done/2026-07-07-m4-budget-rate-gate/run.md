# RUN — M4: 사용자별 budget/rate 게이트

slug: m4-budget-rate-gate · task: 39 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 2단계: Usage(S1) → Gate 병렬(S2 budget·S3 rate).

## 계획대로 된 것

- **S1**: `budget` 도메인, Redis INCR+EXPIRE로 사용자별 30일 고정 주기 토큰 누적(토큰 수는 길이 기반 휴리스틱, 실 usage_metadata는 LLM 포트가 아직 안 전달). assist 5개+dynamic_update 추출 엔드포인트에 배선.
- **S2**: `require_budget_available` 의존성 — 한도 도달 시 429+"이번 주기 사용량 한도 도달", LLM 호출 전에 차단(호출 카운트 0으로 테스트 확인). `BUDGET_TOKEN_LIMIT`(기본 100,000) 설정 추가.
- **S3**: `slowapi.Limiter`를 실제로 적용(10/minute, 사용자+작업종류별), 429를 앱 공통 에러 포맷으로 래핑 + `Retry-After` 헤더.

## 계획 대비 차이 (divergences)

1. **실 버그 발견·수정(S1)**: pytest-asyncio가 테스트마다 새 이벤트루프를 쓰는데 `core.redis`의 전역 클라이언트가 첫 사용 루프에 묶여 있어 실 Redis를 건드리는 테스트가 "Future attached to a different loop"로 깨질 뻔함 — `conftest.py`에 autouse Redis 종료 fixture 추가로 해결(이번이 실 Redis를 건드리는 첫 테스트라 처음 드러남).
2. **실 버그 발견·수정(S3)**: slowapi 기본 `key_style="url"`은 리터럴 경로로 버킷팅해 다른 씬의 `/assist/continue` 호출이 같은 한도에 안 쌓이는 우회 가능한 결함 — `key_style="endpoint"`(함수명 기준)로 수정.
3. **Redis 기반 rate limiter 스토리지는 스킵(S3, YAGNI)** — 현재 단일 워커 배포라 인메모리로 충분, 멀티워커 전환 시 후속.
4. **`_get_user_key`를 `main.py`에서 `core/rate_limit.py`로 이동** — 도메인 라우터가 앱 엔트리포인트를 import하지 않게 하는 정리, 기존 테스트 2건도 함께 이동.

## 검증 (UAT)

- api: 직접 `task lint`(신규 코드 0 에러, 7건 무관 baseline) / `task test`(797 passed, 1 skipped, 12 failed 전부 무관). budget/rate 관련 신규 테스트(usage 4·gate 6·rate 4+) 전부 통과 확인.
- DoD 충족: budget 초과 시 생성 차단+완곡 안내(시스템 오류 아님), rate 초과 시 429+안내.
