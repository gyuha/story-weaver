<!-- forge-slug: stream-cancel-accounting -->
<!-- task: 65 -->
# RUN — 스트리밍 취소 회계

실행 형태: **직접 실행(워크플로우 아님).** 7파일, 위치 전부 사전 특정, 조사 완료 상태라 병렬 이득이 없었다.
모드: `tdd: on`, `eco: on`. 슬라이스마다 붉은 상태를 먼저 확인한 뒤 구현했다.

## 슬라이스 결과

- S1 `astream`에 `except asyncio.CancelledError` → 부분 응답 + `error="cancelled"` 로그 — ✅ 계획대로
- S2 라우터 3곳 부분 예산 차감 + `anyio` 주 의존성 승격 — ⚠ `chat_router`는 새 `except`가 아니라 기존 `finally`를 shield로 감쌈 (아래)
- S3 `useSynopsisContinueStream`에 `stop` 노출 + `onCancel` 배선 + 거짓 docstring 정정 — ✅ 계획대로
- S4 실스택 통합 검증 — ✅ 계획대로, 그리고 **shield 제거 시 red를 실제로 확인**했다

## 계획대로 된 것

- **TDD 규율을 지켰다.** S1은 "취소 시 기록 0건"(`assert 0 == 1`), S2는 "`record_usage` 0회 await", S3는 "`stop` 미호출"로 각각 red를 먼저 봤다.
- **S1은 shield 없이 맞았다** — `_record_call`은 sync이고 `asyncio.create_task`로 fire-and-forget하므로 anyio 스코프의 자식이 아니라 취소 후에도 살아남는다. 계획의 판단이 코드로 확인됐다.
- **완주 경로 이중 차감을 3곳 모두 테스트로 고정**했다(가장 그럴듯한 사고로 지목한 것). 제공자 거절 문구만 받고 취소된 경우 차감하지 않는 것도 고정했다.
- **비목표 무침범** — `useChatStream`에 `stop` 추가 안 함 · `chat_router:332` 일반 챗 프록시 예산 미적용 그대로 · `useAssistStream`·편집기·선택영역 UI 무변경 · `budget_token_limit` 무변경 · 비스트리밍 `record_usage` 2곳 무변경 · 새 ADR 없음.

## 계획과 달라진 것 (divergence)

1. **`chat_router`는 구조가 달랐다.** 계획은 "3곳 각각에 `except asyncio.CancelledError`를 추가"라고 했지만, `_stream_work_chat_response`는 이미 `finally:` 블록에서 저장+차감을 한다. `finally`는 취소 시에도 실행되므로 새 `except`는 불필요하고, 문제는 **그 안의 첫 `await`(`add_message`)이 즉시 재취소돼 뒤의 차감에 도달하지 못하는 것**이었다. 그래서 `finally` 본문 전체를 shield로 감쌌다.
2. **그 결과 취소 시 부분 어시스턴트 메시지가 저장되게 됐다** — 계획이 명시하지 않은 동작 변화다(비목표는 `chat_router:545`를 지목했고 `:701`은 언급이 없었다). 저장과 차감을 분리하면 "돈은 받고 메시지는 버린다"가 되어 더 나쁘다고 판단해 같은 shield 안에 뒀다. **이 판단은 계획에 없던 것이므로 리뷰 대상이다.**
3. **`_charge_sent` 사설 헬퍼를 라우터마다 하나씩 만들었다.** 계획은 "래퍼로 추상화하지 않는다"였는데, 이건 그 래퍼(사이트 간 공용 + 예측 인자)가 아니라 **같은 함수 안 완주·취소 두 경로가 동일한 조건을 쓰게 하는 모듈 내부 헬퍼**다. 조건을 한 함수에 두 번 복붙하면 드리프트가 나는 자리라 이 편이 맞다고 봤다.
4. **단위 테스트로는 shield 필요성을 잡을 수 없다는 것이 실측으로 드러났다.** shield를 임시 제거하고 돌린 결과:

   | shield | 통합 테스트(실스택) | 단위 테스트 |
   |---|---|---|
   | 있음 | ✅ 차감 완주 | ✅ 6 passed |
   | 제거 | ❌ **red** (`charged == []`) | ⚠ **여전히 6 passed** |

   평범한 `task.cancel()`은 취소를 한 번만 전달해 후속 `await`이 그냥 성공하기 때문이다. 즉 **계획의 S2 완성기준("취소하면 `record_usage`가 한 번 호출된다")은 읽히는 것보다 약하다** — 그 기준만으로는 shield가 없어도 통과한다. S4가 실제 방어선이고, 계획이 S4를 넣어둔 것이 결정적이었다.
5. **`_stream_work_chat_response`의 취소 단위 테스트는 구현 전에 이미 통과했다**(기존 `finally` 때문). TDD의 red를 못 본 유일한 케이스다. 회귀 방어용으로 남겼다.
6. **테스트 파일을 3개 새로 만들었다** — 계획은 개수·위치를 정하지 않았다. `tests/test_stream_cancel_accounting.py`(3경로 교차 관심사를 한 곳에), `tests/test_stream_cancel_shield.py`(실스택), `web/.../__tests__/synopsis-continue.api.test.ts`(훅). 3경로를 나란히 둔 이유는 "한 곳만 고치고 나머지를 잊는 것"이 이 작업의 가장 그럴듯한 사고이기 때문이다.
7. **`manuscript_router:126-127`의 stale 주석 2구절을 정정했다**(계획의 검증 노트에 예고한 대로). `ruff SIM117` 1건도 수정했다.

## 최종 게이트 (직접 재실행)

- api `uv run ruff check src tests` → All checks passed! · `uv run mypy src` → Success (159 files)
- api `uv run pytest` → **938 passed, 1 skipped, 12 failed** — 실패 12건은 전부 `Makefile` 부재(Taskfile 이전 후 방치된 사전 존재 실패)로 **이번 변경으로 인한 신규 실패 0**. 신규 테스트 9건(S1 2 · S2 6 · S4 1).
- web `pnpm typecheck` clean · `pnpm lint` clean(219 files) · `pnpm test` → **48 files / 283 tests passed**
- `anyio`가 주 `dependencies`로 승격되고 dev 그룹에서 제거됨(`uv sync` 통과).

## 막혔던 곳 / 환경 이슈

- 테스트에서 `asyncio.create_task`를 패치하면 테스트 자신의 태스크 생성까지 가로채므로 `asyncio.get_running_loop().create_task(...)`로 우회해야 했다.
- **여전히 미커밋**이고 이제 `assist_router.py`·`manuscript_router.py`·`chat_router.py`에 #64와 #65의 변경이 섞였다 — 작업별 커밋 분리는 파일 단위로 불가능하고 hunk 단위 스테이징이 필요하다.

## 후속 작업 후보

- **`Makefile` 참조 테스트 12건 정리** — 매 실행마다 "신규 실패 0"을 사람이 손으로 판정해야 한다. 두 작업 연속으로 같은 노이즈를 넘겼다.
- `useChatStream`에 `stop` 노출 + 챗 UI 배선(백엔드 회계는 이미 준비됨).
- `chat_router:332` 일반 챗 프록시의 예산 미적용.
- 취소 시 부분 어시스턴트 메시지 저장(divergence 2)이 제품상 옳은지 확인.
