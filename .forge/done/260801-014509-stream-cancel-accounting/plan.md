<!-- forge-slug: stream-cancel-accounting -->
<!-- task: 65 -->
<!-- tdd: on -->
<!-- priority: high -->
# 스트리밍 취소 회계 — 취소된 생성을 로그·예산에 남기고, 기획의도 취소가 실제로 멈추게 한다

## Goal / Non-goals
- Goal: SSE 스트리밍 생성이 **클라이언트 취소로 중단될 때** ① `llm_call_logs`에 부분 응답 + `cancelled` 표식이 남고 ② 그때까지 받은 분량이 사용자 예산에서 차감되게 한다(스트리밍 3곳 전부). 그리고 ③ 기획의도 AI 이어쓰기의 `취소`가 실제로 스트림을 중단시키게 한다(`useSynopsisContinueStream`에 `stop` 노출 + 배선).
- Non-goals: **`useChatStream`(작품 챗)·나머지 프론트에 `stop` 배선을 추가하지 않는다** — 이번엔 백엔드 회계만 선제 대비하고 프론트 배선은 별도 사이클 · `chat_router:332`(일반 챗 프록시)의 **예산 미적용은 손대지 않는다**(기존 별개 문제) · `chat_router:545`의 취소 시 부분 어시스턴트 메시지 미저장도 그대로 둔다 · `useAssistStream` 무변경(이미 `stop` 있음)·편집기·선택영역 UI 무변경 · `budget_token_limit` 값·주기 무변경 · 비스트리밍 `record_usage` 2곳(`dynamic_update:133`·`works_router:201`) 무변경 · 배치 차감 방식과 `asyncio.shield` 방식은 실측으로 탈락(아래) — 채택하지 않는다 · 새 ADR 없음.

## Source of truth
- Glossary: `.forge/CONTEXT.md`의 **AI 이어쓰기 (Continue)** — "작가가 후보를 채택한다". 취소는 채택하지 않고 빠져나가는 경로이며, 이 작업은 그 경로가 자원 회계상 정직해지게 한다. 새 용어를 추가하지 않는다(취소는 도메인 개념이 아니라 상호작용이다).
- Related ADRs: `0004-user-llm-setting-as-quality-tier.md`(사용자는 모델·키를 직접 다루지 않으므로 예산이 유일한 사용량 통제 수단) · `0012-ai-chapter-title-as-assist-task.md`(assist 태스크가 스트리밍 헬퍼를 공유). **새 ADR 없음** — shield 관용구는 되돌리기가 싸서 3조건 게이트를 통과하지 못한다. 대신 실측 수치를 코드 주석에 남긴다(이 저장소가 `tier_routing` 등에서 이미 쓰는 방식).

### 착수 전 실측으로 확정된 사실 (전부 직접 측정, 추론 아님)
- **`except asyncio.CancelledError: await record_usage(...)`는 조용히 아무 일도 안 한다.** 실제 sse-starlette 3.4.2 + uvicorn 스택에서 클라이언트가 중간에 끊는 상황을 재현해 측정: 제너레이터에 도달하는 예외는 `CancelledError`가 맞지만(`GeneratorExit` 아님), **그 핸들러 안의 `await`이 즉시 `CancelledError`로 재취소된다** — `await asyncio.sleep(0)`조차 실패했다. 감싸는 anyio 취소 스코프가 여전히 취소 상태이기 때문이다. 뻔한 구현을 그대로 넣었으면 "고쳤다"고 봉인하고 실제로는 안 걷혔을 것이다.
- **`anyio.CancelScope(shield=True)`가 정답이다.** 같은 조건에서 세 후보를 비교 측정:

  | 후보 | 관측 | 실제 차감 |
  |---|---|---|
  | `anyio.CancelScope(shield=True)` | 예외 없이 완주 | 보낸 만큼 정확 |
  | `asyncio.shield(...)` | 밖의 await이 `CancelledError` | 부수효과는 나지만 확인 불가 |
  | 배치 차감(N청크마다) | 취소 처리 없음 | 마지막 부분 배치 손실 |
- **`LLMClient._record_call`은 sync**(`llm_client.py:180` — `def`, `async def` 아님)다. 따라서 `astream`의 취소 로그 기록에는 **shield가 필요 없다**. 예산 차감(`record_usage` → `await redis.incrby`)에만 필요하다.
- **`src/` 전체에 `except BaseException`도 bare `except:`도 없다**(전수 grep). `CancelledError`가 모든 계층을 깨끗이 통과하며, 특히 `moderation_service._live_stream`의 `except Exception`(`:108`)도 삼키지 않는다. 전제가 성립한다.
- **`anyio`는 `[dependency-groups] dev`에만 선언돼 있다**(`pyproject.toml:81`, "async test helpers"). `src/`에서 직접 import하려면 주 의존성으로 올려야 한다 — 지금은 starlette 경유 전이 의존에 얹혀 있는 셈이다.
- **`record_usage` 전수 5곳 중 스트리밍은 정확히 3곳**이고 셋 다 `record_usage`를 루프 뒤에 두어 같은 구멍을 갖는다: `assist_router:211` · `chat_router:717` · `manuscript_router:173`.
- **프론트에서 실제로 abort하는 경로는 하나뿐이다** — `useAssistStream`만 `stop`을 노출하고(`assist.api.ts:194`), `manuscript.tsx:120`·`selection-ai-menu.tsx:110`이 호출한다. `useSynopsisContinueStream`(`synopsis-continue.api.ts:150`)과 `useChatStream`(`chat.api.ts:206`)은 `stop`을 노출하지 않고, `editor/` 밖에서 `.stop()`을 호출하는 곳이 없다. 즉 **운영 중 실제로 새는 것은 assist 경로 하나**지만 그게 가장 많이 쓰이는 경로(편집기 이어쓰기 + 선택영역 4개 액션)이고, 나머지 둘은 `stop`이 붙는 순간 같이 샌다.
- **`budget_token_limit`은 주기당 100,000 토큰 하드 쿼터**이고 초과 시 429(`config.py:409`·`budget/dependency.py:24`). 취소가 회계에 안 잡히면 시작-취소 반복으로 쿼터를 무제한 우회할 수 있다.
- **`useSynopsisContinueStream`의 docstring이 거짓이다** — "useAssistStream과 동일 모양(`{ start, text, isStreaming, error }`)"이라 적었지만 `useAssistStream`은 `{ start, stop, ... }`을 반환한다. 이 stale docstring이 `stop` 누락의 근원이다.
- **`SuggestionPicker`(기획의도가 쓰는 팝오버)의 `onCancel`은 `취소` 버튼에서만 발생한다** — 바깥 클릭 경로가 없다(`onOpenChange`는 `ContinueSuggestionModal` 쪽 것). 그래서 `stop()`을 붙여도 실수로 생성이 날아가는 위험은 없다. (모달 쪽은 Esc·백드롭이 `onCancel`→`assist.stop()`으로 이어지는 기존 동작이며 이번에 바꾸지 않는다.)

### 결정 요약 (그릴링 합의)
- **취소된 생성을 기록한다** — `llm_call_logs`에 부분 응답 + `cancelled` 표식. 이게 없으면 "취소로 토큰을 절약했다"를 애초에 측정할 수 없다(취소된 호출이 표에서 사라지므로).
- **부분 사용량을 예산에서 차감한다.** 반대 논거(취소 버튼이 징벌적으로 느껴진다)를 인정하되, 받은 분량만 차감되므로 체감이 작고, 안 걷으면 하드 쿼터가 무제한 우회된다. 프로바이더는 이미 과금했다.
- **래퍼로 추상화하지 않는다.** 3곳에 `except asyncio.CancelledError:` 블록을 각각 둔다. 예산 차감 조건이 사이트마다 달라 공용 래퍼는 예측 인자를 받게 되고 그건 요청 없는 유연성이며, budget↔moderation 도메인 경계도 넘게 된다.

## Definition of Done
- 스트리밍 3곳 각각에서, 취소 시 **`llm_call_logs`에 행이 남고**(부분 응답 + `cancelled`) **Redis 예산 카운터가 받은 분량만큼 증가**한다.
- 기획의도 AI 이어쓰기에서 `취소`를 누르면 **서버 생성이 실제로 멈춘다**(로그의 부분 응답이 완주분보다 짧다).
- 정상 완주 시의 기존 회계가 **바뀌지 않는다**(중복 차감 없음 — 취소 경로와 완주 경로가 둘 다 돌지 않는다).
- `uv run ruff check src tests` · `uv run mypy src` 통과. `uv run pytest`에서 이번 변경으로 인한 신규 실패 0(`Makefile` 부재로 인한 기존 실패 12건은 무관).
- web `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과.
- `anyio`가 주 의존성으로 선언돼 있다.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. `astream` 취소 로그 — `llm_client.py`의 `astream`에 `except asyncio.CancelledError:`를 추가해 `self._record_call(response="".join(response_parts), error="cancelled", usage_metadata=None, ...)` 후 `raise`. `_record_call`이 sync이므로 **shield를 쓰지 않는다**(shield를 안 써도 되는 이유를 주석에 남긴다). 기존 `except Exception` 경로와 완주 경로는 건드리지 않는다. — completion criterion: pytest — ① `astream`을 소비하는 태스크를 청크 1개 수신 후 `cancel()`하면 `_record_call`이 **정확히 한 번** `error="cancelled"` + 그때까지의 부분 응답으로 호출된다, ② 정상 완주 시 `_record_call`이 여전히 `error=None`으로 한 번만 호출된다(중복 없음), ③ `except Exception` 경로 기존 테스트 green. (depends: none)
- [ ] S2. 라우터 3곳 부분 예산 차감 + `anyio` 승격 — `assist_router._stream_response`(`:189`) · `manuscript_router._stream_synopsis_continue` · `chat_router`의 스트리밍 제너레이터(`:701` 일대) 각각에 `except asyncio.CancelledError:`를 추가하고, 그 안에서 **`with anyio.CancelScope(shield=True):` 안에서** 기존과 동일한 조건(`combined and combined != PROVIDER_DECLINE_MESSAGE` 등 사이트별 조건 유지)으로 `await record_usage(...)`를 호출한 뒤 `raise`. **shield 없이는 이 await이 즉시 재취소돼 아무 일도 일어나지 않는다는 실측 근거를 각 지점이 아니라 한 곳(가장 먼저 읽히는 `assist_router`)에 주석으로 남기고 나머지는 그것을 가리킨다.** `pyproject.toml`의 `anyio`를 dev 그룹에서 주 `dependencies`로 옮긴다(dev 그룹에서는 제거 — 중복 선언하지 않는다). — completion criterion: pytest — ① 3곳 각각에서 소비 태스크를 중간에 취소하면 `record_usage`가 **받은 분량으로 한 번** 호출된다, ② 완주 시 기존과 동일하게 한 번만 호출된다(취소+완주 이중 차감 없음), ③ 제공자 거절(`PROVIDER_DECLINE_MESSAGE`)만 받고 취소된 경우 차감하지 않는다, ④ `uv run pip`/`uv sync` 기준으로 `anyio`가 주 의존성에 있다. (depends: none — S1과 다른 파일)
- [ ] S3. 기획의도 프론트 `stop` 배선 — `synopsis-continue.api.ts`의 `useSynopsisContinueStream`에 `useAssistStream`과 **동일한 모양**으로 `stop`을 추가(`abortRef.current?.abort()`)하고 반환 객체에 넣는다. **거짓인 docstring**("동일 모양 `{ start, text, isStreaming, error }`")을 실제 반환 모양으로 고친다. `synopsis-editor.tsx:137`의 `onCancel={() => setShowDraft(false)}`를 `stop()` 호출 후 닫도록 바꾼다(편집기 `dismissDraft`와 같은 순서). — completion criterion: vitest — ① `useSynopsisContinueStream`이 `stop`을 노출하고 호출 시 진행 중 요청이 abort된다, ② `synopsis-editor`에서 `취소`를 누르면 `stop`이 호출된다(기존 `synopsis-editor.test.tsx`의 훅 목업에 `stop` 추가), ③ `pnpm typecheck`·`lint`·`test` 통과. (depends: none)
- [ ] S4. 통합 검증 — 실제 끊김 재현 — 실제 서버(uvicorn) + 실제 클라이언트 끊김으로 취소를 재현하는 통합 테스트를 1건 추가한다(착수 전 실측에 쓴 프로브와 같은 형태: `EventSourceResponse`로 감싼 느린 제너레이터를 띄우고, 클라이언트가 몇 줄만 받고 끊은 뒤 부수효과가 완주했는지 확인). **단위 테스트만으로는 부족하다** — `anyio.CancelScope(shield=True)`가 pytest의 순수 asyncio 루프에서 동작하는 것과 anyio 태스크그룹 취소 하에서 동작하는 것이 다를 수 있고, 이 작업의 전체 전제가 그 지점에 걸려 있다. — completion criterion: pytest — 실제 끊김 상황에서 부수효과(예산 차감 대역 함수)가 **취소 후에도 완주**함을 단정하는 테스트가 green이며, shield를 제거하면 그 테스트가 red가 된다(방어 장치가 실제로 방어하고 있음을 증명). (depends: S2)

## 검증 노트 (직전 회고 반영)
- **"측정 못 하는 주장을 통과로 기록하지 않는다"(#62의 교훈)를 이 계획의 설계 원칙으로 삼았다.** 그래서 착수 전에 이미 두 번 실측했고, 그 결과가 순진한 구현을 탈락시켰다. S4는 그 실측을 저장소에 고정하는 슬라이스다.
- **소비자를 트리 전체에서 grep해 확정했다**(#61의 교훈) — `record_usage` 5곳, `.stop()` 호출부, `stop`을 노출하는 훅을 각각 전수 조사한 결과를 위에 적었다. 조사 중 제가 두 번 틀렸고(챗 경로가 abort한다고 암시 / "stop을 붙이는 순간 구멍이 생긴다"), 둘 다 코드로 정정했다.
- **테스트 범위를 문자열까지 grep해 잡았다**(#64의 교훈 — 식별자만 grep해 범위를 절반으로 과소추정한 전례). 이번 영향 테스트는 `synopsis-editor.test.tsx`의 훅 목업(반환 객체에 `stop` 없으면 깨진다)을 포함한다.
- **가장 그럴듯한 사고는 "중복 차감"이다.** 취소 경로와 완주 경로가 둘 다 도는 구현을 만들면 사용자가 두 번 과금된다. 그래서 완성기준에 "한 번만"을 3곳 모두 명시했다.
- **두 번째로 그럴듯한 사고는 "shield를 빼먹거나, 있는데 동작하지 않는 것"이다.** 조용히 실패하므로 테스트가 통과해도 운영에서 안 걷힌다. S4의 "shield 제거 시 red"가 그 방어다.
- `manuscript_router.py:126-127`의 주석이 stale하다("precheck→budget→rate→**완화 재시도**"는 #64에서, "**thinking 모드 꺼진** 빠른 티어"는 #63에서 사라졌다). 이번에 그 함수의 제어 흐름을 바꾸므로 **그 두 구절만** 사실과 맞춘다 — 인접 코드 개선이 아니라, 내가 손대는 함수의 게이트 구성을 거짓으로 설명하는 주석이라서다. 그 외 인접 코드는 건드리지 않는다.
