<!-- forge-slug: m4-budget-rate-gate -->
<!-- task: 39 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M4 — 사용자별 budget/rate 게이트

`ai-pipeline.md` 5.2, `PRD.md` 4.1. M3(집필 보조 호출 경로, task 36)에 게이트를 건다.

## 목표 / 비목표

- 목표: 사용자별 누적 토큰(비용) budget 상한 + 요청 rate 상한을 집필 보조 호출 직전에 검사. 초과 시 생성 차단 + 안내(시스템 오류 아님). 모델 승격 시 budget 재검사(4.2, task 36의 티어 분기와 연동).
- 비목표: 실제 요금제별 구체 수치(PRD 4.1 "미결정" — 이 작업은 합리적 기본값 하나로 구조를 동작시키고 수치는 설정값으로 노출해 나중에 조정 가능하게 함). 결제/구독 연동(financial 안전 등급 — 이 작업 범위 아님, 단순 사용량 카운팅만).

## 진실의 출처

- Glossary terms: 품질 티어(Quality Tier) — `.forge/CONTEXT.md`(사용자는 모델명을 직접 다루지 않음, BYOK 아님 — budget도 이 원칙과 정합: 사용자에게는 "이번 주기 사용량"만 노출).
- Related ADRs: `.forge/adr/0004-user-llm-setting-as-quality-tier.md`, `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`.
- 코드 사실: `main.py`에 `slowapi.Limiter` 등록돼 있으나 실제 라우트에 적용된 데코레이터 0건(탐색 확인) — 이 작업에서 실제로 붙인다. budget(토큰 누적) 로직은 전무.
- Definition of Done: budget 초과를 강제로 만들면 생성이 차단되고 완곡한 안내가 뜬다(시스템 500 아님). rate 초과 시 429+안내. `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. 사용량 누적 저장 (TDD) — completion criterion: 사용자별 토큰 사용량을 기록하는 테이블/Redis 카운터(주기 리셋 포함) + 집필 보조 응답 후 사용량 증가.
- [ ] S2. Budget 게이트 (TDD) — completion criterion: 집필 보조 엔드포인트(task 36) 호출 직전 사용자 누적 사용량이 상한 초과 시 429 대신 명확한 사용자 대면 메시지("이번 주기 사용량 한도 도달")로 차단. 모델 승격 경로도 동일 게이트 재검사.
- [ ] S3. Rate 게이트 (TDD) — completion criterion: `slowapi.Limiter`를 집필 보조 라우트에 실제 적용, 초과 시 429+짧은 대기 안내.
- [ ] S4. 검증 — completion criterion: `task lint`/`task test` 통과. (depends: S1-S3)
