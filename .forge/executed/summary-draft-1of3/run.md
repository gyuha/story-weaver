<!-- forge-slug: summary-draft-1of3 -->
<!-- task: 69 -->
# RUN — 늘려쓰기 (1/3) 요약을 본문으로 펼치는 assist 태스크

실행 형태: **직접 실행(워크플로우 아님).** api 6파일에 순차 의존이 있어 병렬 이득이 없다.
모드: `tdd: on`, `eco: on`. `Run all` 배치의 1/3번째(#69 → #70 → #71).

## 슬라이스 결과

- S1 `draft` 태스크 등록(TaskType·TASK_TIER·지시문) — ⚠ #67이 남긴 `len(TaskType) == 7` 단정이 깨져 함께 고쳤다(아래)
- S2 `DraftInput` + 프롬프트 분기(`_format_memory_full`) — ✅ 계획대로
- S3 라우터 엔드포인트 `POST /draft` — ✅ 계획대로

## 계획대로 된 것

- **TDD 규율을 지켰다.** S1은 `TaskType.draft` 부재(AttributeError), S2는 `DraftInput` import 실패, S3는 `_draft_llm_client` 부재로 각각 red를 먼저 봤다.
- **계획이 배선 지점 9곳을 전수 적어 둔 것이 값을 했다.** #67 run.md의 "태스크 추가는 표 두 줄이 아니다"를 반영해 `TaskType`·`TASK_TIER`·`_TASK_INSTRUCTION`·`DraftInput`·`AssistTaskInput` 유니온·`prompt_assembler` 분기·`DraftRequest`·`_draft_llm_client`·라우터를 미리 나열했고, 실제로 그 9곳이 전부 필요했다. 빠뜨린 배선이 **없었다** — #67·#68에서 반복된 과소평가가 이번엔 재발하지 않았다.
- **메모리 주입을 양성으로 고정했다.** 이 태스크는 `assist_service.py:59`의 생략 목록에 **넣지 않는 것**으로 전체 메모리가 켜지므로, "빠뜨려서 켜졌다"와 "의도해서 켰다"가 코드상 구분되지 않는다. 그래서 ① 프롬프트 조립 결과에 P1(엔티티 `한지원`)·P2(`life_status`)·P3(벡터 매칭 문장)이 전부 실리는지 ② 라우터에서 `MemorySearchService.search`가 **실제로 호출**되는지를 단정했다. 후자는 `title`·`summary` 테스트가 "호출되면 안 된다"를 단정하는 것의 정반대다.
  - **그 방어가 실재하는지 직접 확인했다** — ① `draft`를 생략 목록에 넣고 ② 포맷터를 `_format_memory_full` → `_format_memory_minimal`로 바꾼 뒤 재실행하니 **정확히 그 두 테스트만 red**(2 failed / 36 passed), 복원 후 70 passed. 즉 메모리 주입이 꺼지면 조용히 넘어가지 않는다.
- **JSONL 누출 방지 목록에 `draft`를 넣었다**(#62의 방어) — 지시문에 `{"text"`가 없음을 파라미터 테스트가 고정한다.
- **비목표 무침범** — web 무변경 · `pnpm generate` 안 함 · 서버가 `chapters.body`를 저장하지 않음(생성만) · 길이 옵션 없음 · 일괄 집필 없음 · 새 ADR 없음 · `assist_service`의 생략 목록 무변경.

## 계획과 달라진 것 (divergence)

1. **#67이 남긴 `len(TaskType) == 7` 단정이 깨졌다.** 태스크를 하나 추가하면 무관한 테스트가 실패하는 구조다 — 그 개수는 `test_all_task_types_are_mapped`(`set(TASK_TIER) == set(TaskType)`)가 이미 "표와 enum이 일치한다"로 지키므로 중복이었다. **#67의 단정과 내가 이번에 새로 쓴 `len(TaskType) == 8` 단정 둘 다** 존재 단정으로 바꿨다. 계획이 이 충돌을 예상하지 못했다 — 개수 고정 테스트는 그 자체가 미래의 마찰이다.
2. **`ruff check --fix`가 4건을 정리했다** — 내가 추가한 import 정렬·포맷. 자동 수정.

## 최종 게이트 (직접 재실행)

- `uv run ruff check src tests` → All checks passed! · `uv run mypy src` → Success (159 files)
- `uv run pytest` → **955 passed, 1 skipped, 12 failed** — 실패 12건은 전부 `Makefile` 부재(Taskfile 이전 후 방치된 사전 존재 실패)로 **이번 변경으로 인한 신규 실패 0**. 신규 테스트 6건(S1 1 + 누출목록 파라미터 1 · S2 2 · S3 2).

## 막혔던 곳 / 환경 이슈

- 없음.
- **미커밋** — 이 파트의 api 변경. 이번 그릴링이 추가한 `.forge/CONTEXT.md` 용어 2건(**화 요약**·**늘려쓰기**)도 미커밋이다. `.forge/codebase/` 7파일은 이전 세션의 fg-map 재생성분으로 여전히 남아 있다.

## 후속 작업 후보

- **part 2/3**(`summary-draft-2of3`, 요약 편집·저장) → **part 3/3**(늘려쓰기 배선). 3/3에서 `pnpm generate`와 `AssistTaskType` 배선을 한다.
- **개수 고정 테스트를 다른 곳에도 썼는지 훑어볼 가치가 있다** — `len(...) == N` 형태는 무관한 추가마다 깨진다. 이번엔 두 곳이었다.
