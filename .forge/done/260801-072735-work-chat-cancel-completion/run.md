<!-- forge-slug: work-chat-cancel-completion -->
<!-- task: 66 -->
# RUN — 작품 챗 취소 완결

실행 형태: **직접 실행(워크플로우 아님).** api 2파일 + web 3파일, 위치 전부 사전 특정, 착수 전 실측 완료라 병렬 이득이 없었다.
모드: `tdd: on`, `eco: on`. 슬라이스마다 붉은 상태를 먼저 확인한 뒤 구현했다.

## 슬라이스 결과

- S1 취소 시 `finish_reason='cancelled'` (플래그 + docstring 열거값) — ✅ 계획대로
- S2 `useChatStream`에 `stop` 노출 + docstring 정정 — ✅ 계획대로
- S3 전송 → 중단 버튼 전환 — ⚠ 기존 테스트 1건을 갱신해야 했고(스트리밍 중 전송 버튼이 사라지므로), 내 새 테스트 1건의 설정이 비현실적이어서 고쳤다(아래)
- (계획 외) 실스택 회귀 테스트 1건 추가 — ⚠ 계획에 없던 슬라이스. 운영 제너레이터를 실제 끊김으로 태워 `finish_reason='cancelled'`를 단정한다(아래)

## 계획대로 된 것

- **TDD 규율을 지켰다.** S1은 `finish_reason='stop'` vs `'cancelled'` 불일치로, S2는 `stop`이 존재하지 않아 타입 에러로, S3는 `생성 중단` 버튼을 찾지 못해 각각 red를 먼저 봤다.
- **착수 전 실측이 그대로 성립했다** — `except asyncio.CancelledError`에서 플래그를 세우고 shield로 감싼 `finally`가 읽는 구조가 계획의 프로브 결과와 일치했다. 추가 프로브가 필요 없었다.
- **계획이 지목한 두 함정을 둘 다 테스트로 막았다.** ① `disabled` 조건을 그대로 두면 중단 버튼이 항상 비활성 — 전환 시 `disabled={!input.trim()}`로 바꿔 스트리밍 조건을 뺐고, "중단 버튼이 `not.toBeDisabled()`"를 단정했다. ② 플래그 없이 값을 바꾸면 완주까지 `'cancelled'`가 됨 — 완주 경로 테스트를 새로 추가해 `'stop'`을 고정했다.
- **#65의 방어선을 건드리지 않았다** — `tests/test_stream_cancel_shield.py`와 `tests/test_stream_cancel_accounting.py`의 예산 차감 단정이 전부 green 유지(364 passed로 확인).
- **UI 보존 로직을 추가하지 않았다** — 계획이 코드로 확인한 대로 `memory-panel.tsx:566-571`이 이미 커밋한다. 추가했다면 말풍선이 두 개 생겼을 것이다.
- **비목표 무침범** — 부분 답변을 지우거나 컨텍스트에서 빼지 않음 · `send_message`(`:526`·`:563`)·일반 챗 프록시(`:332`) 무변경 · 예산 차감·shield 무변경 · Alembic 마이그레이션 없음 · 재개(resume) 기능 없음 · 새 ADR 없음.

## 계획과 달라진 것 (divergence)

1. **기존 테스트 1건을 갱신해야 했다** — `memory-panel.test.tsx`의 "스트리밍 중에는 입력·전송이 비활성화된다"가 `getByRole('button', { name: '전송' })).toBeDisabled()`를 단정했는데, 전송 버튼이 스트리밍 중 **사라지므로** 이 단정이 성립할 수 없다. "입력은 여전히 비활성 + 전송은 사라지고 중단이 나타난다"로 다시 썼다. 계획이 이 파일의 기존 테스트 충돌을 예상하지 못했다.
2. **내가 쓴 S3 테스트 1건의 설정이 비현실적이었다** — 부분 답변 보존을 확인하려고 `send()`를 거치지 않고 목업 상태만 직접 세웠는데, 커밋 게이트 `committedRef`가 `useRef(true)`로 시작해 `send()`에서만 열린다(`:547`, `:589`). 그래서 실제 사용자 흐름(입력 → 전송 → 중단)을 거치도록 고쳤다. **제품 결함이 아니라 내 테스트의 결함이었다** — 계획의 "UI가 이미 커밋한다"는 확인은 옳았고, 다만 그 커밋에 전제 조건이 있다는 것을 계획에 적지 않았다.
3. **`chapterId`가 필수 필드였다** — S2 테스트에서 `payload: { content }`만 주었더니 타입 에러(`SendWorkChatMessageRequest`에 `chapterId` 필수, `string`이라 `null`도 불가). 에디터 진단이 즉시 잡아줘서 두 번 고쳤다.
4. **`Square` 아이콘 import를 빼먹었다** — `lucide-react`에서 추가. 진단이 잡았다.
5. **계획에 없던 실스택 테스트 1건을 추가했다** — 계획은 "S1이 #65가 이미 깐 shield 안에서 값만 고르므로 새 실스택 테스트는 필요 없다"고 판단했다. **그 판단이 안전한 쪽으로 틀렸다.** 내가 가진 증거는 ① 합성 제너레이터 프로브 ② 평범한 `task.cancel()` 단위 테스트뿐이었고, 둘 다 **운영 제너레이터가 실제 anyio 취소에서 플래그를 세우는지**는 증명하지 않는다. `tests/test_stream_cancel_shield.py`에 `_stream_work_chat_response`를 실제 uvicorn + 실제 끊김으로 태워 `finish_reason='cancelled'`를 단정하는 테스트를 추가했다(green).
   - **방어 여부를 실제로 확인했다** — 플래그를 임시 제거하고 재실행: 실스택 테스트 red(`+ stop`), 단위 테스트도 red. **#65의 shield와 달리 이번엔 단위 테스트도 red가 된다** — 플래그 대입은 `await`이 아니라 sync라 `task.cancel()`로도 경로를 태우기 때문이다. 실스택 테스트가 추가로 잡는 것은 "`CancelledError`가 제너레이터에 아예 도달하지 않는"(`GeneratorExit`) 경우이고, 단위 테스트는 그걸 볼 수 없다.

## 최종 게이트 (직접 재실행)

- api `uv run ruff check src tests` → All checks passed! · `uv run mypy src` → Success (159 files)
- api `uv run pytest` → **940 passed, 1 skipped, 12 failed** — 실패 12건은 전부 `Makefile` 부재(Taskfile 이전 후 방치된 사전 존재 실패)로 **이번 변경으로 인한 신규 실패 0**. 신규 테스트 2건(S1의 완주 경로 고정 + 실스택 finish_reason 회귀).
- web `pnpm typecheck` clean · `pnpm lint` clean(220 files) · `pnpm test` → **49 files / 287 tests passed**(#65 시점 283 + 신규 4: 훅 2 + 패널 2, 갱신 1)

## 막혔던 곳 / 환경 이슈

- 없음. 진단(LSP)이 세 번(타입 2건 + import 1건) 즉시 잡아줘서 왕복이 짧았다.
- **여전히 미커밋**이고 이제 `chat_router.py`에 #64·#65·#66 세 작업의 변경이 섞였다.

## 후속 작업 후보

- **`Makefile` 참조 테스트 12건 정리** — 세 사이클 연속 넘겼다. 매번 "신규 실패 0"을 손으로 판정하고 있다.
- `chat_router:332` 일반 챗 프록시의 사용량 한도 미적용(기존 별개 문제).
- `finish_reason='cancelled'`를 UI에서 표시할지(예: "중단됨" 배지) — 지금은 프론트가 이 필드를 읽지 않는다.
