# RUN — M4: 전체이용가 모더레이션 완곡 처리

slug: m4-moderation-handling · task: 40 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

작은 단일 응집 단위(S1+S2를 한 도메인)라 워크플로우 1단계로 처리 후, 직접 발견한 회귀를 제가 직접 수정.

## 계획대로 된 것

- `moderation` 도메인 — S1 키워드 기반 선제 가드(`is_explicit_content`), S2 거절/빈 응답 시 완화 프롬프트로 1회 재시도(`stream_with_retry`/`invoke_with_retry`), raw provider 예외 비노출. assist 5개 엔드포인트 + dynamic_update 추출에 배선.

## 계획 대비 차이 (divergences) — 제가 직접 발견·수정

1. **실 스트리밍 회귀 발견·수정(제가 직접)**: 워크플로우가 만든 `stream_with_retry`는 `[chunk async for chunk in llm.stream(messages)]`로 **전체 응답을 다 모은 뒤** 반환하는 구조였다. `_stream_response`가 이 리스트를 그대로 재생하다 보니, task 37에서 실 UAT로 확인했던 "토큰 도착 즉시 점진 렌더"가 깨지고 **LLM 응답이 전부 완성될 때까지 클라이언트에 아무것도 안 가다가 한꺼번에 쏟아지는** 형태로 바뀌어 있었다. 실 curl 타임스탬프 확인으로 재현 확인 후, `stream_with_retry`를 진짜 async generator로 재작성 — 청크를 도착 즉시 yield하고, **한 글자도 못 받았을 때만** 완화 재시도로 전환(이미 일부 스트리밍한 뒤 중간에 끊기면 재시도하지 않고 그대로 종료 — 이미 보낸 내용을 되돌릴 수 없어 재시도를 덧붙이면 사용자에게 더 혼란스럽기 때문). 관련 유닛 테스트 5건을 새 시그니처(코루틴→async generator)에 맞게 재작성 + 진행형 스트리밍·부분전송후무재시도 테스트 2건 추가. `_stream_response`도 `outcome.chunks`/`outcome.notice`/`outcome.declined` 필드 접근 대신 스트림을 그대로 중계하도록 수정(사용량 기록은 누적 텍스트가 `RETRY_DECLINE_MESSAGE`와 다를 때만).
2. **별개 발견(수정 대상 아님) — z.ai(GLM) 자체가 진짜 토큰 단위 스트리밍이 아님**: 위 수정 후에도 실 curl 재검증에서 청크가 한 타임스탬프에 몰려 도착하는 경우가 있어, **이 작업과 완전히 무관한 기존 `chat/stream` 엔드포인트**(task 27 이전부터 존재, 이번 드라이브에서 전혀 손대지 않음)로 대조 검증 — 동일하게 응답을 2~3개의 큰 뭉치로만 나눠 보냄(토큰 단위가 아님)을 확인. 즉 이건 z.ai/litellm 쪼)의 프로바이더 레벨 특성이라 이번 작업의 회귀가 아니다. 제 수정은 "여러 뭉치가 오면 첫 뭉치를 즉시 보여준다"는 개선은 유효하게 만들지만, 프로바이더 자체가 뭉치를 1개만 보내는 요청에는 체감 차이가 없다 — **후속 조사 후보로 기록**(다른 프로바이더/스트리밍 옵션 조사는 이번 범위 밖).
3. **줄길이 lint 에러 1건** — 수정한 함수 시그니처가 100컬럼을 넘어 줄바꿈으로 수정.

## 검증 (UAT)

- `task lint`(신규 코드 0 에러, 7건 baseline만 남음) / `task test`(819 passed, 1 skipped, 12 failed 전부 무관). `tests/moderation`+`tests/assist`+`tests/dynamic_update` 70개 전부 통과(실 LLM 호출 2건 포함).
- **직접 실 e2e 재검증**: 회원가입→작품/씬 생성→`/assist/continue` 실 호출로 스트리밍 타이밍을 타임스탬프별로 재확인, 프로바이더 자체 버스트 특성까지 `chat/stream`과 대조해 원인 정확히 분리.
- DoD 충족: 19금 키워드 입력에 선제 가드 완곡 안내, API 거절 시 raw 오류 미노출, 스트리밍 응답이 다시 진행형으로 동작(프로바이더가 여러 뭉치를 보낼 때는 개선 체감됨).
