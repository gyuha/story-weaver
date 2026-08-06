<!-- forge-slug: summary-draft-1of3 -->
<!-- task: 69 -->
<!-- tdd: on -->
<!-- part: 1/3 -->
<!-- priority: medium -->
# 늘려쓰기 (1/3) — 요약을 본문으로 펼치는 assist 태스크

## Goal / Non-goals
- Goal: **8번째 assist 태스크 `draft`**를 추가한다 — 화 요약을 근거로 그 화의 본문을 생성해 SSE로 스트리밍한다. **메모리 전체를 주입한다**(다른 집필 태스크와 같은 등급). 화면 배선은 part 3/3.
- Non-goals: **web 무변경** — `pnpm generate`도 part 3/3 · 요약 편집·저장 UI는 part 2/3 · 본문 반영·대체 확인은 part 3/3 · 생성 결과를 서버가 `chapters.body`에 저장하지 않는다(생성만; 저장은 기존 PATCH 경로) · 여러 화를 한 번에 집필하는 기능 없음 · 길이 옵션(짧게/길게) 없음 · 새 ADR 없음(아래 근거).

## Source of truth
- Glossary: **늘려쓰기 (Draft from Summary)** · **화 요약 (Chapter Summary)** — 이번 그릴링에서 `.forge/CONTEXT.md`에 신설했다. 핵심 구분: **[[AI 이어쓰기]]와 방향이 반대다.** 이어쓰기 항목은 "AI가 이어 쓰는 것이 아니라 작가가 후보를 채택하는 구조"임을 명시적으로 못박고 `_Avoid_`에 "AI가 원고를 대신 쓴다는 함의를 피한다"까지 적어 두었는데, 늘려쓰기는 정확히 원고를 대신 쓴다. 그래서 별 항목으로 분리했고, 코드·UI에서 두 낱말을 섞어 쓰면 안 된다.
- Related ADRs: **`0012-ai-chapter-title-as-assist-task`** — 화 단위 AI 작업은 전용 엔드포인트 대신 assist 태스크로 얹어 모더레이션·티어 라우팅·rate limit·LLM 로깅·SSE 헬퍼를 재사용한다. `summary`(task #67)가 이미 같은 선례를 따랐다. **새 ADR 없음** — 되돌리기가 싸고(태스크 하나), 놀랍지 않으며(선례 둘), 트레이드오프가 ADR-0012에서 이미 결정됐다.

### 착수 전 조사로 확정된 사실 (전부 파일·줄 확인)
- **assist 태스크는 현재 7개다** — `TaskType`(`tier_routing.py:36-43`): `continue_·infill·dialogue·style·correct·title_·summary`.
- **메모리 생략 목록은 3개뿐이다** — `assist_service.py:59`가 `if task_type in (TaskType.correct, TaskType.title_, TaskType.summary)`일 때만 검색을 건너뛴다. **`draft`를 이 목록에 넣지 않으면 전체 메모리(P1~P3)가 자동으로 주입된다** — 별도 배선이 필요 없다.
- **`summary` 태스크 추가가 도메인 4파일 배선이었다**(task #67 run.md의 divergence 2) — `TaskType`+`TASK_TIER`, `_TASK_INSTRUCTION`, `SummaryInput`+`AssistTaskInput` 유니온, `prompt_assembler` 분기, 라우터 스키마+엔드포인트. `draft`도 같은 규모다. 계획이 "표 두 줄"로 과소평가하지 않도록 여기에 전수 적어 둔다.
- **단일 본문 태스크는 JSONL 계약을 받으면 안 된다** — `continue_`에만 있고, 나머지에 `{"text"`가 없음을 파라미터 테스트가 고정한다(`test_prompt_assembler.py:227-233`). `draft`도 그 목록에 넣는다.
- **메모리 전체 주입의 포맷터가 이미 있다** — `prompt_assembler`가 `_format_memory_full`/`_light`/`_minimal` 세 등급을 쓴다. 집필 태스크(`continue_`·`infill`·`dialogue`)가 `full`을 쓴다.

### 결정 요약 (그릴링 합의)
- **메모리 전체를 주입한다.** 인물 설정·타임라인을 모르고 쓰면 뻔한 문장이 나오고, 그건 "기억하는 AI"라는 제품 전제가 무너지는 지점이다. `correct`·`title`·`summary`가 최소 주입인 것과 반대 방향이다.
- **티어는 `high_quality`** — `dialogue`·`style`과 같은 등급. 이건 원고를 대신 쓰는 작업이라 이 제품에서 품질이 가장 중요한 생성이다. (참고: assist 라우터는 현재 모든 태스크가 `get_fast_writing_client()`를 쓰므로 `TASK_TIER` 값이 아직 실제 라우팅에 영향을 주지 않는다 — task #63에서 확인. 표의 의도만 맞춰 둔다. **실제 티어 라우팅이 붙으면 이 태스크가 자동으로 좋은 모델로 간다**는 것이 이 값을 지금 제대로 정해 두는 이유다.)
- **길이 지시를 강하게 걸지 않는다.** 요약의 사건 수에 따라 필요한 분량이 달라진다 — "요약의 각 사건을 문단으로 펼쳐라, 요약에 없는 사건을 만들지 마라"로 구조만 제약한다.

## Definition of Done
- `POST /api/v1/works/{work_id}/chapters/{chapter_id}/assist/draft`가 요약 텍스트를 받아 본문을 SSE로 스트리밍한다.
- 이 태스크가 **전체 메모리를 주입**한다(프롬프트에 메모리 컨텍스트가 실린다) — `correct`·`title`·`summary`처럼 생략하지 않는다.
- `draft` 지시문에 JSONL 계약(`{"text"`)이 들어가지 않는다.
- 빈 요약은 422로 막는다(`summary`·`title`과 같은 가드).
- api `uv run ruff check src tests` · `uv run mypy src` 통과, `uv run pytest`에서 이번 변경으로 인한 신규 실패 0(`Makefile` 부재로 인한 기존 실패 12건은 무관).

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. `draft` 태스크 등록 — `TaskType.draft`·`TASK_TIER[draft]=high_quality`·`_TASK_INSTRUCTION[draft]`("아래 요약을 근거로 이 화의 본문을 쓰세요. 요약의 각 사건을 문단으로 펼치고, 요약에 없는 사건을 새로 만들지 마세요. 머리말·제목·설명 없이 본문만 출력하세요.")를 추가한다. `TaskType`이 8개가 된다. — completion criterion: pytest — ① `TaskType.draft.value == "draft"`이고 `len(TaskType) == 8`, ② `TASK_TIER[draft] is Tier.high_quality`, ③ `set(TASK_TIER) == set(TaskType)`(기존 테스트가 자동 검증), ④ JSONL 누출 방지 파라미터 목록에 `draft`를 넣어 `{"text"`가 없음을 단정. (depends: none)
- [ ] S2. 입력 스키마와 프롬프트 분기 — `DraftInput(text: str)` 데이터클래스 + `AssistTaskInput` 유니온에 추가하고, `prompt_assembler`에 `draft` 분기를 넣어 **`_format_memory_full`** 을 쓰게 한다(집필 태스크와 같은 등급). `assist_service.py:59`의 메모리 생략 목록은 **건드리지 않는다** — 넣지 않는 것이 곧 전체 검색이다. — completion criterion: pytest — ① `draft` 프롬프트에 메모리 컨텍스트가 실린다(엔티티명·타임라인 상태 키가 조립 결과에 나타난다 — 기존 `continue` 테스트와 같은 단정), ② 잘못된 입력 타입이면 `TypeError`, ③ user 메시지가 전달된 요약 텍스트다. (depends: S1)
- [ ] S3. 라우터 엔드포인트 — `DraftRequest`(빈 문자열·공백 거부 validator)·`_draft_llm_client`·`POST /draft`를 다른 assist 태스크와 동일한 SSE 형태로 추가한다. `bind_llm_call_context(task="assist.draft")`. — completion criterion: pytest — ① 200 + SSE 청크 + `[DONE]`, ② 빈 요약은 422, ③ 예산 초과 시 429(다른 태스크와 동일 게이트), ④ **전체 메모리 검색이 실제로 호출된다**(`title`·`summary` 테스트가 "호출되면 안 된다"를 단정하는 것의 반대 — `MemorySearchService.search`가 불렸는지 확인). (depends: S2)

## 검증 노트 (직전 회고 반영)
- **"태스크 추가는 표 두 줄"이 아니다**(#67 run.md divergence 2에서 실측). 위 S1~S3에 배선 지점을 전수 적었다 — `TaskType`·`TASK_TIER`·`_TASK_INSTRUCTION`·`DraftInput`·`AssistTaskInput` 유니온·`prompt_assembler` 분기·`DraftRequest`·`_draft_llm_client`·라우터. 프론트의 `AssistTaskType`은 part 3/3 몫이다(#68에서 이걸 빠뜨려 **테스트 315건이 통과하는데 typecheck만 잡았다** — 테스트 목업이 타입을 우회한다).
- **메모리 주입은 "안 넣는 것"으로 켜진다** — 생략 목록에 추가하지 않는 것이 전체 검색이다. 그래서 "빠뜨려서 켜졌다"와 "의도해서 켰다"가 코드상 구분되지 않는다. S2·S3의 완성기준에 **메모리가 실제로 실렸는지**를 양성으로 단정해 의도를 고정한다.
- **가장 그럴듯한 사고는 JSONL 누출이다** — `draft`가 `continue_`의 JSONL 계약을 물려받으면 본문이 `{"text":"…"}`로 나온다. 파라미터 목록에 넣는다(#62에서 만든 방어).
- part 2/3(`summary-draft-2of3`, 요약 편집·저장)은 **이 파트에 의존하지 않는다** — 순서를 바꿔도 된다. part 3/3(늘려쓰기 배선)만 1/3과 2/3 둘 다를 필요로 한다.
