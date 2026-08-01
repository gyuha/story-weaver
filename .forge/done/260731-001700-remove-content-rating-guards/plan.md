<!-- forge-slug: remove-content-rating-guards -->
<!-- task: 64 -->
<!-- tdd: on -->
<!-- priority: high -->
# 연령·수위 제한 제거 — 모더레이션 가드와 프롬프트 수위 지시 걷어내기

## Goal / Non-goals
- Goal: 제품이 강제하는 연령·수위 제한을 전부 제거한다. ① moderation의 **S1 키워드 선제 가드**(`is_explicit_content`)와 그 호출부 6곳 제거 ② **S2 완화 재시도**(`_soften`·`SOFTENED_NOTICE`·`RETRY_DECLINE_MESSAGE`)와 `PRECHECK_DECLINE_MESSAGE` 제거 ③ 프롬프트에 박힌 **"전체이용가(약 15세) 수위를 지키세요" 지시 3곳** 제거 ④ 이미지 프롬프트 수위 가드 제거 ⑤ 모델이 거절하면 **사실대로 알리는 메시지**로 대체(완곡 위장·자동 순화 없음).
- Non-goals: **운영 오류 분류를 유지한다** — `_OPERATIONAL_LLM_ERRORS` → `LLMUnavailableError`(502)는 수위와 무관한 인프라 기능이므로 손대지 않는다(없애면 인증 실패·레이트리밋이 다시 정체불명 실패로 돌아간다) · **`moderation` 도메인을 리네임하지 않음** — 책임이 "LLM 호출 실패 분류"로 축소되어 이름이 부적절해지지만 리네임은 import 전반을 건드려 비용이 크다(docstring으로 책임 변경을 기록) · **무검열 모델 배선하지 않음** — 현재 모델은 상용 gpt-5.6이라 노골적 성적 묘사는 계속 제공자가 거절한다(별도 결정) · **연령 인증 구현하지 않음**(별도 ADR·작업) · `docs/ai-pipeline.md` 6장·`docs/image-generation.md` 4장 갱신은 이번 범위 밖(후속) · 빈/공백 입력 차단 가드(`assist_router.py:86,117`·`chat_router.py:641`·`manuscript_schemas.py:42`)는 **유지** — 수위가 아니라 제공사 400 방어다 · web 무변경(메시지 문구는 백엔드가 내려준다)
- 참고: 이 작업은 **#62(이어쓰기 후보 형식 계약)**·**#63(z.ai 잔재 제거)**와 독립이다. 서로 다른 파일을 건드린다.

## Source of truth
- Glossary terms: `.forge/CONTEXT.md`에 수위·연령 관련 용어는 **없다**(grep 0건) — 글로서리 갱신 대상이 아니다. **품질 티어**는 생성 품질(저비용/균형/고품질)이지 콘텐츠 수위가 아니므로 무관하다.
- Related ADRs: **`260730-070532-remove-all-ages-content-restriction.md`(이번 그릴링에서 작성) — 이 작업의 근거이며 `ADR-0003`을 전체 대체한다.** ADR-0003(`0003-commercial-llm-all-ages-content-policy.md`)은 "상용 API 하이브리드 + 전체이용가"를 결정했으나 두 전제 모두 무효다(프로바이더가 자체 호스팅 OpenAI 호환 라우터로 바뀜). ADR-0003의 실제 은퇴 처리(`adr/retired/` 이동)는 **fg-cleanup의 몫**이며 이 작업에서 하지 않는다.
- 착수 전 재현·조사로 확정된 사실:
  - **오탐 재현(2026-07-30)**: `is_explicit_content()`가 단순 부분 문자열 매칭(`keyword in text`)이라 실제 원고를 차단했다 — `[수사관: 지금부터 뒤를 돌아보지 마십시오.]` → `보지` 적중, `달을 보지 마십시오` → 적중, `그는 아무것도 보지 못했다` → 적중, `잠을 자지 않았다` → `자지` 적중, `집안 사정이 어려웠다` → `사정` 적중. **한국어 어미·명사의 일부를 19금 키워드로 오인**한다.
  - **차단 범위가 넓다**: `is_explicit_content`는 `assist_router`·`chat_router`·`works_router`·`manuscript_router`·`image_generation_service`·`extraction_service` **6곳**에서 쓰인다 → 이어쓰기뿐 아니라 채팅·작품 생성·이미지·동적 업데이트까지 같은 원고에서 함께 막힌다.
  - **사용자가 본 메시지의 정확한 출처**: `moderation_service.py:59` `PRECHECK_DECLINE_MESSAGE = "본 서비스는 전체이용가 수위까지 지원합니다."` → S1 경로다. `llm_call_logs`의 마지막 행이 07-29 15:25이고 사용자 시도 시각(07-30 00:2x)에 행이 없다는 점이 **LLM 호출 전에 막혔음**을 뒷받침한다.
  - **모더레이션은 이미 부분 개선돼 있다** — 과거 퀵 레인 기록("모든 예외를 수위 메시지로 정규화")과 달리 현재는 `_OPERATIONAL_LLM_ERRORS`를 `LLMUnavailableError`로 표면화한다. 그 개선분은 **보존 대상**이다.
  - **프롬프트가 별도 억제 축이다**: `prompt_assembler.py:30`·`chat_context_service.py:66`·`manuscript_router.py:158`에 "전체이용가(약 15세) 수위를 지키세요: 노골적 성적 묘사·과도한 잔혹 묘사는 금지합니다"가 박혀 있다. **모더레이션만 제거하면 모델이 계속 스스로 억제한다.**
  - **빈 응답/알 수 없는 예외 경로가 존재한다**: 현재 주석이 "제공사별 콘텐츠 거절 신호가 제각각이라 알 수 없는 예외는 삼켜 완화 재시도/완곡 안내로 처리한다"고 밝힌다. 완화 재시도를 없애면 이 경로의 처리를 새로 정해야 한다(아래 결정).
- 결정 요약(그릴링 합의):
  - **범위 = 우리 층 전부 제거.** 오탐만 제거하는 최소안은 거절했다 — 한국어에서 부분 문자열 매칭은 근본적으로 취약해 다른 키워드로 재발하고, 프롬프트 지시가 남아 생성이 계속 억제된다.
  - **거절 처리 = 사실대로 알리기.** 완화 재시도를 제거하고, 제공자가 거절하거나 빈 응답이면 "모델이 이 생성을 거절했습니다" 취지의 정직한 안내를 낸다. 그것이 **우리 정책이 아니라 모델 제공자 정책**임이 문구에서 드러나야 한다. 이번 사고의 본질이 "잘못된 이유 표시"였으므로 이 문구가 작업의 핵심 산출물 중 하나다. 정확한 문안은 실행 단계가 정한다.
  - **자동 순화 금지.** 작가가 쓴 수위를 시스템이 낮추지 않는다(연령 제한 제거 결정과 정합).
  - **운영 오류 경로는 손대지 않는다**(위 비목표).
- Definition of Done:
  - `[수사관: 지금부터 뒤를 돌아보지 마십시오.]`가 포함된 원고에서 **이어쓰기·채팅·작품 생성이 정상 동작한다**(브라우저 육안 — 이번 버그의 직접 재현 케이스).
  - `grep -rn "전체이용가\|19금" api/src`가 **0건**(빈 입력 방어 주석의 "수위 거절로 오인" 문구는 남아도 무해하나, 가능하면 함께 정리).
  - 모델이 거절하는 입력에서 **"수위" 표현이 아닌 정직한 안내**가 표시되고, 자동 순화가 일어나지 않는다.
  - **운영 오류는 여전히 502 + `LLM_UNAVAILABLE_MESSAGE`로 표면화된다**(회귀 없음).
  - api `task lint`(ruff+mypy) 통과, `task test`에서 이번 변경으로 인한 신규 실패 0(Makefile 부재 기존 실패 12건은 무관).

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 운영 오류 경로를 먼저 테스트로 고정 — 삭제 전에 **지우면 안 되는 것**을 못박는다. `_OPERATIONAL_LLM_ERRORS`의 각 예외(최소 `AuthenticationError`·`RateLimitError`·`APIConnectionError`)가 `LLMUnavailableError`(502, `LLM_UNAVAILABLE_MESSAGE`)로 표면화되는지 검증하는 테스트를 (없다면) 추가하고, 있다면 그대로 유지 확인. — completion criterion: pytest — 위 예외 3종이 각각 `LLMUnavailableError`를 일으키고 raw 메시지가 사용자에게 노출되지 않는다. 이 테스트가 S2·S3 이후에도 green이어야 한다. (depends: none)
- [ ] S2. S1 키워드 가드 + 호출부 제거 — `moderation_service.py`에서 `is_explicit_content`·`_EXPLICIT_KEYWORDS`·`PRECHECK_DECLINE_MESSAGE`를 제거하고, 호출부 6곳(`assist_router`·`chat_router`·`works_router`·`manuscript_router`·`image_generation_service`·`extraction_service`)에서 선제 가드 분기를 걷어낸다. 각 호출부의 나머지 게이트(빈 입력 방어·budget·rate limit)는 보존한다. — completion criterion: pytest — ① 재현 문장(`뒤를 돌아보지 마십시오`·`잠을 자지 않았다`·`사정이 있다`)이 포함된 입력이 **차단되지 않고** LLM 호출까지 도달한다(각 호출부별 최소 1건), ② 기존에 "19금 키워드면 차단한다"를 곁쇄하던 테스트는 **삭제하거나 새 요구사항으로 다시 쓴다**(통과시키려 가드를 남기면 안 된다), ③ 빈/공백 입력 차단은 여전히 동작한다. (depends: S1)
- [ ] S3. S2 완화 재시도 제거 + 정직한 거절 안내 — `_soften`·`_SOFTEN_INSTRUCTION`·`SOFTENED_NOTICE`·`RETRY_DECLINE_MESSAGE`를 제거하고, 빈 응답/알 수 없는 예외에 대해 "모델 제공자가 생성을 거절했다"는 취지의 새 안내로 응답한다(자동 순화 없음). `ModerationOutcome`의 `notice` 필드가 쓰이지 않게 되면 함께 정리한다. 도메인·모듈 docstring을 "LLM 호출 실패 분류"로 재작성한다. — completion criterion: pytest — ① 빈 응답 시 순화 재시도를 **하지 않고**(LLM이 한 번만 호출됨) 거절 안내를 낸다, ② 그 안내 문구에 "수위"라는 표현이 없다, ③ 운영 오류는 여전히 `LLMUnavailableError`(S1의 테스트 green 유지), ④ web이 그 응답을 지금과 같은 경로로 표시한다(계약 무변경). (depends: S1, S2)
- [ ] S4. 프롬프트 수위 지시 + 이미지 가드 제거 — `prompt_assembler.py:30`·`chat_context_service.py:66`·`manuscript_router.py:158`의 "전체이용가(약 15세) 수위를 지키세요…" 문장을 제거하고, `image_generation_service.py`의 프롬프트 수위 가드를 제거한다. — completion criterion: pytest — ① 조립된 시스템 프롬프트에 "전체이용가"·"19금"·"수위" 문자열이 없다(assist·chat·기획의도 세 경로 각각), ② 이미지 생성 경로가 수위 사유로 거절하지 않는다, ③ `grep -rn "전체이용가\|19금" api/src` 0건. (depends: none — S1~S3과 다른 파일이라 병렬 가능)

## 검증 노트 (직전 회고 반영)
- **호출부를 트리 전체에서 grep해 확정했다** — `is_explicit_content` 소비자 6곳을 위에 나열했다. #61에서 파일 두 개만 grep하고 "확인했다"고 플랜에 써서 세 번째 소비자를 놓친 전례가 있다.
- **"지우면 안 되는 것"을 S1로 먼저 고정한다** — 삭제 작업의 고유 위험은 과잉 삭제다. 운영 오류 분류(#59에서 z.ai 400을 수위로 오인했던 사고의 해결책)를 테스트로 박아두고 나서 지운다.
- **구 계약을 곁쇄하는 테스트를 미리 지목했다** — "19금 키워드면 차단"을 검증하는 기존 테스트는 통과시킬 대상이 아니라 삭제·재작성 대상이다(#61·#62에서 같은 유형을 겪었다).
- **테스트 green을 검증 증거로 쓰지 않는다** — 실제 원고(`뒤를 돌아보지 마십시오` 포함)로 이어쓰기·채팅을 브라우저에서 돌려봐야 한다. 이 버그 자체가 "테스트는 통과하는데 실사용이 막힌" 형태였다.
- **UAT에서 기대치를 명확히 할 것** — 제한을 없애도 현재 모델(상용 gpt-5.6)은 노골적 성적 묘사를 거절한다. UAT의 통과 기준은 "무엇이든 생성된다"가 **아니라** ① 평범한 원고가 더 이상 오탐 차단되지 않는다 ② 거절될 때 "수위"가 아닌 정직한 이유가 표시된다 ③ 운영 오류가 502로 구분된다, 셋이다.
