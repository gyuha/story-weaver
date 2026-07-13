<!-- forge-slug: llm-call-db-logging -->
<!-- task: 48 -->
<!-- tdd: on -->
# LLM 호출 입출력 DB 로깅 — llm_call_logs 30일 보관

## Goal / Non-goals

- Goal: 모든 LLM 호출(assist 5작업·chat·dynamic_update·works beat-sheet·relationships)의 입력 메시지·출력·실패(예외)를 Postgres `llm_call_logs`에 기록해, SQL로 호출 단위 조회·디버깅이 가능하게 한다. 보존은 30일(ADR-0009).
- Non-goals:
  - 조회용 admin API/UI (SQL 직접 조회로 충분 — 필요해지면 별도 태스크)
  - Langfuse 등 외부 관측 도구 도입 (ADR-0009에서 기각, 필요 시 supersede)
  - 토큰 비용 정산 로직 변경 (`estimate_tokens` 실측치 개선은 후속 태스크 — 로그에 usage 토큰 수는 저장해 둔다)
  - chat 대화 이력 기능 (이 로그는 운영용이지 사용자 대면 이력이 아님)
  - 개인정보 고지·약관 문구 정비 (ADR-0009 Consequences — 별도 태스크)

## Source of truth

- Glossary terms: 작품 (Work), 씬 (Scene), 품질 티어 (Quality Tier) — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/0009-llm-call-log-retention.md` (전문 30일 보관 정책 — 이 태스크의 근거), `.forge/adr/0003-commercial-llm-all-ages-content-policy.md` (수위 정책 맥락)
- 그릴링 확정 결정:
  - **훅 위치**: `LLMClient.astream/ainvoke` 레벨(`api/src/domains/chat/llm_client.py`) — 5개 도메인 자동 커버, 모더레이션이 예외를 삼키기 **전**에 기록(기록 후 re-raise, 기존 동작 불변). 완화 재시도는 호출마다 1행(2회면 2행).
  - **컨텍스트 전달**: `correlation_id`는 기존 structlog contextvars(`core/middleware.py` 패턴)에서 읽고, `user_id`·작업종류(예: `assist.continue`, `chat`, `works.beat_sheet`)는 전용 contextvar 모듈을 만들어 각 라우터/의존성에서 바인딩. 컨텍스트가 비어도(백그라운드 호출 등) 로그는 남긴다(nullable).
  - **보존·삭제**: 30일 상수 + INSERT 경로 기회적 삭제(예: 100회당 1회 `DELETE WHERE created_at < now() - 30 days`) — 스케줄러 의존성 없음(budget의 Redis TTL과 같은 "인프라 없는 주기 리셋" 결).
  - **저장 항목(최소)**: id·created_at·correlation_id·user_id(nullable)·task(nullable)·model·provider·messages(JSONB 전문)·response(TEXT)·error(TEXT nullable)·latency_ms·prompt_tokens/completion_tokens(usage_metadata 있을 때만, nullable).
  - **쓰기 경로**: 스트리밍 완료/예외 시점에 **자체 세션(session factory)으로 fire-and-forget** 저장 — 요청 지연 0, 로그 저장 실패는 warning 로그만 남기고 절대 본 호출을 막지 않음(ADR-0009 Consequences).
- 제약: 도메인 간 DB 모델 직접 import 금지(api/CLAUDE.md) — 모델·repository는 `LLMClient`가 속한 `chat` 도메인 안에 둔다. Alembic autogenerate 마이그레이션은 SQL 검토 후 적용(api/CLAUDE.md 규칙 — 커밋은 사용자 요청 시).
- Definition of Done: 실 LLM 호출(성공 1건·실패 1건) 후 psql로 `llm_call_logs`에서 프롬프트 전문·응답/에러·task·user_id를 조회할 수 있고, `task lint`(ruff+mypy strict)·pytest 통과(무관한 기존 Makefile 스테일 실패 12건 제외).

## Work slices

- [ ] S1. `chat` 도메인에 `LLMCallLog` 모델 + Alembic 마이그레이션 + 저장/기회적 삭제 repository(자체 세션 fire-and-forget 저장 함수 포함). — 완료 기준: 마이그레이션 적용 후 repository 단위 테스트(TDD — 저장·30일 경과 행 기회적 삭제) 통과
- [ ] S2. LLM 로그 컨텍스트 contextvar 모듈 신설 + 5개 도메인 라우터/의존성에서 user_id·작업종류 바인딩(correlation_id는 기존 contextvars 재사용). — 완료 기준: 바인딩/미바인딩 각각의 단위 테스트(TDD) 통과, 5개 도메인 바인딩 지점 전수 확인
- [ ] S3. `LLMClient.astream/ainvoke`에 기록 훅: 성공(전문+latency+usage 토큰)·실패(error 기록 후 re-raise) 저장, INSERT 경로 기회적 삭제 트리거. 기존 모더레이션·스트리밍 동작 불변. — 완료 기준: 성공/예외/완화 재시도(2행) 시나리오 테스트(TDD) 통과, 기존 chat·assist·moderation 테스트 회귀 없음 (depends: S1, S2)
- [ ] S4. 검증: `task lint` + pytest 전체 + 실호출 UAT(성공 1건·빈 프롬프트 등 실패 1건 유발 후 psql 조회로 행 확인). — 완료 기준: DoD 충족 (depends: S3)
