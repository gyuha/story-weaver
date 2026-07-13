<!-- forge-slug: llm-call-db-logging -->
# run — LLM 호출 입출력 DB 로깅 (2026-07-11)

Dynamic Workflow `wf_40782931-6ba` (직렬 S1→S2→S3→Review→Fix→S4, 기본 서브에이전트 ×6, eco: sonnet 캡 + ECO 주입, TDD on). 6 에이전트 전부 완료, 오류 0.

## 계획대로 된 것

- S1 — `LLMCallLog` 모델(chat 도메인, 계획의 저장 항목 전부) + Alembic `0009_llm_call_logs` 생성·검토·로컬 적용 + `save_llm_call_log`(자체 세션, 예외 삼킴) + 모듈 카운터 100회당 1회 기회적 삭제(30일). 테스트 4건 선작성(TDD).
- S2 — `core/llm_call_context.py`(ContextVar bind/get) + **5개 도메인 전수 바인딩**(assist 5작업·chat·dynamic_update·works.beat_sheet·relationships). 테스트 3건 선작성.
- S3 — `LLMClient.ainvoke/astream` 기록 훅: messages 전문(JSONB)·응답 전문·latency·usage 토큰·correlation_id(기존 structlog contextvars)·user/task(S2), 예외 시 error 기록 후 re-raise, `asyncio.create_task` fire-and-forget. invoke/stream 브리지는 ainvoke/astream 경유 확인 → 훅 2곳으로 충분. 테스트 5건 선작성(완화 재시도 2행 포함).
- Review→Fix — 적대적 리뷰가 **치명 1건**을 실증(아래) → 수정 에이전트가 해결, 전체 테스트 재통과.
- S4 — 슬라이스 전부 충족 판정(코드 증거), Non-goals 미침범, **실호출 UAT: 성공·실패 각 1건이 psql 조회로 확인됨**. 메인 세션에서도 직접 재확인 — 성공(`uat.success`, 응답 68자)·실패(`uat.failure`, error 기록)에 더해 다른 도메인 실호출(`works.beat_sheet` 등)이 이미 task 라벨로 적재 중.
- 최종: pytest **888 passed** (스테일 12건 제외 회귀 0), 변경 파일 한정 ruff·mypy strict 클린.

## 차이 (divergences)

1. **리뷰가 잡은 치명 결함** — S3의 `_record_call`에서 create_task 스케줄링 **전**의 동기 준비 코드(`convert_to_openai_messages`, 컨텍스트 조회)가 try 밖이라, 직렬화 실패 시 성공한 LLM 응답을 502로 바꾸거나(비스트리밍 chat), 원래 provider 예외를 가리는(모더레이션 경로에선 성공 생성물이 수위 거절로 둔갑) 경로를 리뷰 에이전트가 **직접 재현으로 실증**. 수정: 준비 코드 전체를 try/except로 감싸 warning 후 return(ADR-0009 불변식 준수). — 계획이 "저장 함수가 예외를 삼킨다"고만 명시해 준비 단계의 예외를 놓친 설계 공백.
2. **계획의 UAT 방법이 자기 무효화** — 계획 S4의 "빈 프롬프트로 실패 유발"은 직전 quick 작업(빈 cursor_text 422 차단)과 충돌(리뷰 비치명 지적). S4는 라우터 대신 LLMClient 직접 호출로 실패를 유발해 검증 — DoD 실질 충족.
3. Alembic autogenerate가 **무관한 기존 스키마 드리프트**(auth 계열 인덱스↔unique, works server_default)를 함께 감지 — 검토 후 llm_call_logs 생성만 남기고 제외. 드리프트 자체는 미해결 잔존(후속 후보).
4. 컨텍스트 모듈 위치: 계획의 "domains/shared/ 또는 core/" 중 **core/** 선택(correlation_id 패턴과 동거, domains/shared는 도메인 모델링 공유 용도).
5. messages 직렬화는 신규 코드 대신 기설치 `langchain_core.convert_to_openai_messages` 재사용(ECO). usage 토큰은 청크 합산 대신 마지막 usage 청크 대입(litellm이 누적 합계를 담음을 소스로 확인). 예외 시 response는 부분 조립 대신 None.
6. `task lint` 전체는 **선존재 lint 부채**(tests/auth/test_auth_flows.py RUF043/RUF059 7건 — 이번 작업 무관)로 실패 — 변경 파일 한정 ruff·mypy는 클린. 부채 정리는 후속 후보.
7. ContextVar 기본값을 None으로(ruff B039 회피) — 공개 API 동일.

## 후속 후보

- 스테일 Makefile 테스트 12건 정리, tests/auth lint 부채 7건, Alembic 스키마 드리프트 정리 — 각각 quick 감.
- 비정책 오류를 수위 메시지로 둔갑시키는 모더레이션 메시지 분류(기존 후보, 이 로그로 이제 실태 파악 가능).
