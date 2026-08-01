<!-- forge-slug: work-chat-cancel-completion -->
<!-- task: 66 -->
<!-- tdd: on -->
<!-- priority: high -->
# 작품 챗 취소 완결 — 중단 버튼 배선과 취소된 부분 답변의 정직한 기록

## Goal / Non-goals
- Goal: 작품 챗(메모리 패널)에서 생성을 **중단할 수 있게** 한다 — ① `useChatStream`에 `stop`을 노출 ② 스트리밍 중 전송 버튼이 **같은 자리에서 중단 버튼으로 전환** ③ 취소 시 저장되는 부분 어시스턴트 메시지의 `finish_reason`을 `"stop"`(거짓)에서 `"cancelled"`로 바로잡는다.
- Non-goals: **부분 답변을 지우거나 컨텍스트에서 빼지 않는다** — 화면에 남고 이후 턴 컨텍스트에도 그대로 들어간다(그릴링 결정 — 아래) · `send_message`(`chat_router:526`·`:563`)와 **일반 챗 프록시(`:332`)는 손대지 않는다**(이 UI가 쓰지 않는 경로) · `:332`의 사용량 한도 미적용은 별도 과제로 남긴다 · 예산 차감 로직·shield 무변경(#65에서 완료) · `useAssistStream`·편집기·기획의도 경로 무변경 · Alembic 마이그레이션 없음 · 대화 목록/새 대화 UI 무변경 · 중단된 답변을 재개(resume)하는 기능은 만들지 않는다.

## Source of truth
- Glossary: `.forge/CONTEXT.md`의 **채팅 (Chat)** · **사용량 한도 (Usage Limit)** — 후자는 "세는 단위는 **전달받은 분량**이다 — AI 이어쓰기를 중간에 취소해도 그때까지 받은 만큼은 한도에 잡힌다". 이 작업은 그 규칙이 **작품 챗에서도 실제로 발동하게** 만드는 쪽이다(지금은 취소 자체가 불가능해 잠재 상태).
- Related ADRs: **`260801-014029-charge-cancelled-generation-usage`** — 취소된 생성도 받은 분량만큼 차감한다는 정책. 그 ADR의 Consequences가 "프론트에서 `stop`을 노출하지 않는 경로(`useChatStream`)는 아직 취소를 발생시키지 않으므로 이 정책이 잠재 상태다. 배선이 붙는 순간 자동으로 적용된다"고 명시했고, **이 작업이 그 배선이다.** 새 ADR 없음 — 정책 결정은 이미 그 ADR에 있고, 여기서 정하는 것은 UI 배치와 기록 정확성뿐이다.

### 착수 전 조사로 확정된 사실
- **작품 챗은 현재 취소되지 않는다** — `useChatStream`(`web/src/features/memory/api/chat.api.ts:206`)이 `{ start, text, isStreaming, error }`만 반환하고 `stop`이 없다. 확인 수단: `grep -rn "return { start, stop" features/` → **`assist.api.ts:194`·`synopsis-continue.api.ts:157` 두 개뿐**이고 `chat.api.ts`는 없다. 따라서 #65가 심은 부분 메시지 저장 경로는 **운영에서 아직 도달 불가능한 잠재 상태**이고, 이 작업이 그것을 활성화한다.
  - 참고 — `.stop()` 프로덕션 호출부는 `grep -rn "\.stop()" features/` 결과 **5곳**이다: `selection-ai-menu.tsx:101`·`:110`, `manuscript.tsx:120`·`:396`, `synopsis-editor.tsx:140`. (#65 계획은 이 중 2곳만 적었다 — 같은 과소열거 실수의 반복이며 이번엔 `PostToolUse` 훅이 잡았다. 챗에 `stop`이 없다는 결론 자체는 위 두 번째 grep이 독립적으로 뒷받침한다.)
- **경로가 일치한다** — 이 UI가 부르는 `POST /api/v1/works/{workId}/chat/messages`(`chat.api.ts:66`)는 `work_router`(prefix `/works/{work_id}/chat`, `:110`)의 `send_work_chat_message`(`:796`)이고, 그것이 `EventSourceResponse(_stream_work_chat_response(...))`(`:850-851`)를 반환한다. `_stream_work_chat_response`는 #65가 `anyio.CancelScope(shield=True)`로 감싼 그 제너레이터다.
- **`finish_reason="stop"`이 거짓 기록이다** — `chat_router:720`이 취소 경로에서도 `finish_reason="stop"`으로 저장한다. `chat_models.py:104` docstring은 값을 `"stop"`·`"length"`·`"tool_calls"`·`None`으로 열거하며 `"cancelled"`가 없다. 컬럼은 `String(32)` nullable(`:121`)이라 **마이그레이션이 필요 없다**. 이 필드는 `chat_schemas.py:26`으로 노출되지만 **프론트는 읽지 않는다**(전수 grep) — 즉 지금은 관측되지 않는 데이터 오염이다.
- **부분 답변은 UI에 이미 남는다** — `memory-panel.tsx:566-571`이 `isStreaming`이 false로 떨어질 때 `chatStream.text`를 말풍선 목록에 편입한다(`committedRef` 가드). 중단해도 화면에서 사라지지 않으므로 **UI 보존 작업은 불필요**하다.
- **부분 답변은 이후 모든 턴의 컨텍스트에 들어간다** — `chat_router:842-848`이 `get_conversation_messages()`로 전체 히스토리를 다시 조립해 `assistant` 행을 전부 `LCAIMessage`로 넣는다. `finish_reason` 필터가 없다.
- **현재 UI에 중단 어포던스가 없다** — 스트리밍 중 입력창과 전송 버튼이 **둘 다 `disabled`**(`memory-panel.tsx:605`, `:653`, `:664`)라 사용자는 기다릴 수밖에 없고, 전송 버튼은 그 시간 동안 유휴 상태다.
- **S1의 플래그 구조가 실스택에서 동작함을 착수 전에 실측했다** — 실제 uvicorn + `EventSourceResponse` + 실제 클라이언트 끊김으로, **`finally`를 가진** 제너레이터(챗과 같은 형태 — #65 프로브는 `finally`가 없는 형태였다)에서 `except asyncio.CancelledError`의 플래그 대입이 실행되고 shield로 감싼 `finally`가 그것을 읽는지 측정: 중간 취소 → `finish_reason='cancelled'`(12자), 완주 → `'stop'`(240자). `GeneratorExit`로 갈라지는 경로는 나타나지 않았다. 이 확인이 없었다면 "플래그가 안 세워져 `finish_reason`이 조용히 `stop`으로 남는" 실패를 단위 테스트가 통과시켰을 것이다(단위 테스트의 `task.cancel()`은 `CancelledError`를 확실히 전달하므로).

### 결정 요약 (그릴링 합의)
- **부분 답변은 남기고 컨텍스트도 유지한다.** 반대 논거(잘린 반쪽 문장이 컨텍스트에 영구히 누적된다)를 인정하되, 잘린 답변은 쓰레기가 아니라 **더 짧은 실제 답변**이고 사용자가 중단하는 이유는 대개 "필요한 건 이미 얻었다"이다. 더 결정적인 것은 **컨텍스트에서만 빼면 사용자가 보는 것과 모델이 보는 것이 어긋난다**는 점 — "방금 자기가 한 말을 왜 기억하지 못하나"가 된다. ChatGPT·Claude도 같은 선택을 한다.
- **전송 버튼이 스트리밍 중 중단 버튼으로 전환한다**(같은 자리, 정사각형 아이콘). 공간을 더 쓰지 않고, 그 버튼은 스트리밍 중 어차피 유휴이며, 사용자가 이미 아는 관용구다. 대안이던 "버블 아래 버튼"은 토큰이 쌓일수록 아래로 밀려 스크롤 밖으로 나가고, "전송 옆 별도 버튼"은 횡으로 짧은 사이드바 패널에서 폭을 낭비하며 항상 보이지만 항상 쓸 수는 없다.
- **`finish_reason` 구분은 플래그로 한다.** shield로 감싼 `finally`는 정상 종료인지 취소인지 알 수 없으므로, `except asyncio.CancelledError:`에서 플래그를 세우고 `finally`가 그것을 읽어 `"cancelled"`/`"stop"`을 고른다. docstring의 열거값에 `"cancelled"`를 추가한다.

## Definition of Done
- 작품 챗에서 생성 중 버튼을 누르면 **스트림이 실제로 멈춘다**(서버 로그의 부분 응답이 완주분보다 짧고 latency가 작다).
- 중단 후 **부분 답변이 화면에 남고**, 입력이 다시 활성화되어 바로 다음 메시지를 보낼 수 있다.
- 중단된 메시지가 DB에 `finish_reason='cancelled'`로 저장된다. 완주한 메시지는 여전히 `'stop'`이다.
- 취소된 분량이 사용량 한도에 반영된다(#65의 회계가 이 경로에서 실제로 발동한다 — `llm_call_logs`에 `error='cancelled'` 행 + Redis 카운터 증가).
- api `uv run ruff check src tests` · `uv run mypy src` 통과, `uv run pytest`에서 이번 변경으로 인한 신규 실패 0(`Makefile` 부재로 인한 기존 실패 12건은 무관).
- web `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 취소 시 `finish_reason='cancelled'` — `chat_router._stream_work_chat_response`에 `except asyncio.CancelledError:`를 추가해 플래그를 세우고 `raise`하며, shield로 감싼 `finally`가 그 플래그로 `finish_reason`을 고르게 한다(`"cancelled"` / `"stop"`). `chat_models.py:104`의 docstring 열거값에 `"cancelled"`를 추가한다. **#65가 넣은 shield·예산 차감은 건드리지 않는다.** — completion criterion: pytest — ① 소비 태스크를 중간에 취소하면 `repo.add_message`가 `finish_reason="cancelled"`로 **한 번** 호출된다, ② 정상 완주 시 여전히 `finish_reason="stop"`으로 한 번 호출된다(회귀), ③ 취소 시 예산 차감도 여전히 발동한다(#65 회계 보존 확인 — `tests/test_stream_cancel_accounting.py`의 작품 챗 테스트가 green 유지). (depends: none)
- [ ] S2. `useChatStream`에 `stop` 노출 — `web/src/features/memory/api/chat.api.ts`의 `useChatStream`에 `useAssistStream`(`editor/api/assist.api.ts:190-194`)과 **동일한 모양**으로 `stop`(`abortRef.current?.abort()`)을 추가하고 반환 객체에 넣는다. 훅 docstring이 반환 모양을 정확히 기술하게 한다. — completion criterion: vitest — ① `useChatStream`이 `stop`을 노출하고 호출 시 진행 중 fetch가 abort된다(`signal.aborted === true`), ② `start`가 기존과 동일하게 동작한다(회귀). (depends: none)
- [ ] S3. 전송 → 중단 버튼 전환 — `memory-panel.tsx`의 전송 버튼이 `chatStream.isStreaming`일 때 **같은 자리에서** 중단 버튼(정사각형 아이콘, `aria-label="생성 중단"`)으로 바뀌고 `chatStream.stop()`을 호출하게 한다. 스트리밍 중에는 `disabled`가 아니어야 한다(현재 `disabled={disabled || !input.trim()}`이라 그대로 두면 누를 수 없다). 입력창의 `disabled={disabled}`는 유지한다. **부분 답변 보존 로직은 추가하지 않는다** — `:566-571`이 이미 처리한다. — completion criterion: vitest — ① 스트리밍 중 `aria-label="생성 중단"` 버튼이 보이고 전송 버튼은 보이지 않는다(그 역도 성립), ② 그 버튼 클릭 시 `stop`이 호출된다, ③ 클릭 후 부분 텍스트가 말풍선 목록에 남는다, ④ 중단 후 입력이 다시 활성화된다. (depends: S2)

## 검증 노트 (직전 회고 반영)
- **취소 관련 코드는 단위 테스트가 거짓 green을 낸다**(#65의 1번 학습, 실측됨) — 평범한 `task.cancel()`은 anyio 스코프의 재취소를 재현하지 못한다. 다만 이번 S1은 **#65가 이미 깐 shield 안에서** `finish_reason` 값만 고르는 것이므로 새 방어 장치를 추가하지 않는다. 그래서 실스택 통합 테스트를 새로 만들 필요는 없고, 대신 **`tests/test_stream_cancel_shield.py`가 계속 green인지**와 **`tests/test_stream_cancel_accounting.py`의 작품 챗 테스트가 계속 green인지**를 완성기준에 넣었다. 그 둘이 깨지면 #65의 방어선을 건드린 것이다.
- **사실 주장에 확인 수단을 같이 적었다**(#65의 2번 학습 — 네 사이클 연속 반복된 실수) — 위 "착수 전 조사로 확정된 사실"의 모든 항목에 파일·줄번호를 달았고, "프론트가 `finish_reason`을 읽지 않는다"·"`editor/` 밖에서 `.stop()`을 부르지 않는다"는 전수 grep 결과다. 추정으로 쓴 문장은 없다.
- **가장 그럴듯한 사고는 두 개다.** ① S3에서 `disabled` 조건을 그대로 두어 **중단 버튼이 눌리지 않는 것** — 현재 조건이 `disabled || !input.trim()`이고 `disabled`가 곧 `isStreaming`이라, 전환만 하고 조건을 안 고치면 항상 비활성이다. ② S1에서 플래그 없이 `finish_reason`을 바꿔 **완주 메시지까지 `"cancelled"`로 기록하는 것**. 둘 다 완성기준에 양방향으로 넣었다.
- **UI 보존 작업을 하지 않는 것이 맞다** — `:566-571`이 이미 커밋한다는 것을 코드로 확인했다. 확인 없이 "보존 로직 추가"를 슬라이스로 넣었다면 중복 편입(말풍선 2개)을 만들었을 것이다.
- **`finish_reason`이 관측되지 않는다는 사실이 이 작업의 우선순위를 낮추지 않는다** — 프론트가 안 읽으니 지금은 무해하지만, 대화 히스토리는 컨텍스트로 재사용되고 나중에 "미완성 답변 표시" 같은 기능이 이 필드를 신뢰할 것이다. 거짓 데이터를 쌓기 전에 고치는 편이 싸다.
