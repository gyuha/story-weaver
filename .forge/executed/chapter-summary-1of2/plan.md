<!-- forge-slug: chapter-summary-1of2 -->
<!-- task: 67 -->
<!-- tdd: on -->
<!-- part: 1/2 -->
<!-- priority: medium -->
# 화 요약 (1/2) — 저장할 자리와 생성 엔드포인트

## Goal / Non-goals
- Goal: 화별 줄거리 요약을 **저장할 수 있게** 하고 **AI로 생성할 수 있게** 한다. ① `chapters.summary` 컬럼 신설(Alembic) ② `ChapterUpdate`·`ChapterResponse`에 `summary` 노출 ③ assist 도메인에 **7번째 태스크 `summary`** 추가(SSE, 기존 인프라 재사용) ④ 곁들여 — 요약만 PATCH해도 본문이 재임베딩되는 낭비를 막는다.
- Non-goals: **web 무변경** — 버튼 배선·모달·검토 화면은 전부 part 2/2 · `pnpm generate`도 part 2 · 요약 자동 생성(저장 시 자동 요약) 없음 — 버튼을 눌렀을 때만 · 요약을 임베딩 대상에 넣지 않음(메모리 검색 변경 없음) · 여러 화를 한 번에 요약하는 일괄 기능 없음 · 요약 이력·버전 관리 없음(덮어쓰기) · `global_seq` 재계산 미결정 사항 무관 · 새 ADR 없음(아래 근거).

## Source of truth
- Glossary: `.forge/CONTEXT.md`의 **화 (= 챕터 / Chapter)** · **타임라인 상태 (Timeline State)**. **요약은 타임라인 상태가 아니다** — 타임라인 상태는 "한 엔티티가 특정 화에서 갖는 상태"(`3화에서 사망`)인 키-값 사실이고, 요약은 "그 화에서 무슨 일이 일어났는가"의 서술이다. 엔티티 카드의 `summary`(한 줄, 임베딩 대상 — `docs/data-model.md:117`)와도 다르다. **용어 추가는 part 2/2에서 화면과 함께 확정한다**(지금 글로서리에 넣으면 화면에 없는 말을 정의하게 된다).
- Related ADRs: **`0012-ai-chapter-title-as-assist-task`** — "화 단위 AI 작업은 전용 엔드포인트를 만들지 말고 assist 태스크로 추가해 모더레이션·티어 라우팅·rate limit·LLM 로깅·SSE 헬퍼를 100% 재사용한다". 그 ADR이 감수한 유일한 대가는 "생성은 씬 스코프, 저장은 화 스코프"라는 부조화였는데 **그 부조화는 이미 사라졌다**(아래 실측) — 따라서 이번엔 대가 없이 선례를 그대로 따른다. **새 ADR 없음**: 되돌리기 비용이 낮고(태스크 하나 추가), 놀랍지 않으며(선례가 명시적), 트레이드오프가 이미 ADR-0012에서 결정됐다.

### 착수 전 조사로 확정된 사실 (전부 파일·줄 확인)
- **`chapters`에 요약을 담을 자리가 없다** — 모델(`manuscript_models.py:59-` : `id·work_id·episode_id·title·order_index·body·global_seq`)에도 스펙(`docs/data-model.md:81-90`)에도 `summary`가 없다. 마이그레이션이 필요하다.
- **assist는 이미 화 스코프다** — `router = APIRouter(prefix="/works/{work_id}/chapters/{chapter_id}/assist")`(`assist_router.py:66`), web도 같은 경로를 쓴다(`assist.api.ts:38`). ADR-0012 본문의 "씬 스코프" 기술은 그 뒤 화 단위로 옮겨져 **현재 무효**다.
- **assist 태스크는 6개다** — `TaskType`(`tier_routing.py`): `continue_·infill·dialogue·style·correct·title_`. 요약이 없다.
- **`ChapterUpdate`는 이미 부분 PATCH다** — `title·order_index·body` 전부 `None` 기본값이고 서비스가 `model_dump(exclude_unset=True)`로 돌린다(`manuscript_service.py:145-146`). **`summary: str | None = None` 한 줄만 더하면 저장 경로가 완성**된다. 전용 엔드포인트가 필요 없다.
- **요약만 저장해도 본문이 재임베딩된다** — `update_chapter`가 조건 없이 `await self._memory_service.index_chapter(work_id, chapter.id, chapter.body)`를 부른다(`manuscript_service.py:147`). 요약 PATCH마다 화 본문 전체가 다시 임베딩되는 낭비이므로 이번에 조건부로 바꾼다.
- **단일 텍스트 태스크는 JSONL 계약을 받으면 안 된다** — `prompt_assembler`의 JSONL 지시는 `continue_`에만 있고, 나머지 태스크에 `{"text"`가 없음을 파라미터 테스트가 고정하고 있다(task #62). 새 `summary` 태스크도 그 집합에 들어가야 한다.

### 결정 요약 (그릴링 합의)
- **요약은 "이 화에서 무슨 일이 일어났는가" 2~3문장**이다. 검토 화면에서 이야기 흐름을 훑는 것이 목적이므로 키워드 나열이 아니라 서술문이다.
- **assist 7번째 태스크로 추가**(ADR-0012 선례). 와이어 포맷은 다른 태스크와 동일한 SSE(`[DONE]` sentinel), 본문은 요청 바디로 직접 받는다(DB 미저장 draft를 반영하는 assist의 관례).
- **티어는 `low_cost`** — `title_`과 같다. 참고: assist 라우터는 현재 모든 태스크가 `get_fast_writing_client()`를 쓰므로 `TASK_TIER` 값은 아직 실제 라우팅에 영향을 주지 않는다(#63에서 확인). 표의 의도만 맞춰 둔다.

## Definition of Done
- `chapters.summary`(nullable text)가 마이그레이션으로 생기고 `alembic upgrade head`·`downgrade`가 모두 동작한다.
- `PATCH .../chapters/{id}`에 `{"summary": "..."}`만 보내면 요약이 저장되고 응답에 반영된다. **본문(`body`)을 함께 보내지 않았을 때 임베딩 재색인이 일어나지 않는다.**
- `POST .../chapters/{id}/assist/summary`가 SSE로 요약을 스트리밍한다.
- `summary` 태스크 지시문에 JSONL 계약(`{"text"`)이 들어가지 않는다.
- api `uv run ruff check src tests` · `uv run mypy src` 통과, `uv run pytest`에서 이번 변경으로 인한 신규 실패 0(`Makefile` 부재로 인한 기존 실패 12건은 무관).

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. `chapters.summary` 저장 경로 — Alembic 마이그레이션(nullable text, 기존 행은 NULL)·`Chapter` 모델 컬럼·`ChapterUpdate.summary`·`ChapterResponse.summary`를 추가한다. `docs/data-model.md`의 `chapters` 표(`:81-90`)에도 한 줄 넣는다. — completion criterion: pytest — ① `{"summary": "..."}`만 PATCH하면 저장되고 응답 `summary`에 나온다, ② `summary`를 안 보낸 PATCH가 기존 요약을 지우지 않는다(`exclude_unset` 확인), ③ 새 화의 `summary`는 `None`이다, ④ `alembic upgrade head` 후 `downgrade -1`이 오류 없이 되돌린다. (depends: none)
- [ ] S2. 요약만 저장할 때 재임베딩하지 않기 — `update_chapter`(`manuscript_service.py:147`)의 `index_chapter` 호출을 **`body`가 이번 업데이트에 포함됐을 때만** 하도록 바꾼다. `create_chapter` 쪽(`:124`)은 건드리지 않는다. 판정은 `data.model_dump(exclude_unset=True)`에 `"body"` 키가 있는지로 한다 — **착수 전 실측**: `ChapterUpdate(body='본문')` → `{'body': '본문'}`, `ChapterUpdate(title='제목')` → `{'title': '제목'}`, `ChapterUpdate()` → `{}`, **`ChapterUpdate(body='')` → `{'body': ''}`**(본문 비우기도 포함된다). — completion criterion: pytest — ① `body`를 포함한 PATCH는 `index_chapter`가 호출된다(회귀), ② `summary`만 보낸 PATCH는 호출되지 않는다, ③ `title`만 보낸 PATCH도 호출되지 않는다(같은 낭비였다), ④ **`body=""`(본문 비우기)는 호출된다** — 빈 문자열을 falsy로 판정하면 지워진 본문의 낡은 임베딩이 남아 메모리가 조용히 틀린다. (depends: S1)
- [ ] S3. assist `summary` 태스크 — `TaskType.summary`·`TASK_TIER[summary]=low_cost`·`_TASK_INSTRUCTION[summary]`("이 화에서 무슨 일이 일어났는지 2~3문장으로 서술. 키워드 나열·머리말·따옴표 금지")·요청 스키마·라우터 엔드포인트를 추가한다. 다른 assist 태스크와 동일한 SSE 형태를 따른다. — completion criterion: pytest — ① `POST .../assist/summary`가 200 + SSE로 청크를 흘리고 `[DONE]`으로 끝난다, ② 지시문에 `{"text"`가 **없다**(JSONL 누출 방지 — 기존 파라미터 테스트가 새 태스크를 포함하도록 갱신), ③ 예산 초과 시 429(다른 태스크와 동일한 게이트), ④ `TaskType`이 7개다. (depends: none — S1/S2와 다른 도메인)

## 검증 노트 (직전 회고 반영)
- **사실 주장마다 확인 수단을 붙였다**(#65·#66 회고의 반복 학습) — 위 "착수 전 조사"의 모든 항목에 파일·줄번호가 있다. 추정으로 쓴 문장은 없다.
- **가장 그럴듯한 사고는 두 개다.** ① S2에서 조건을 잘못 걸어 **본문 PATCH인데도 재색인을 건너뛰는 것** — 그러면 메모리 검색이 낡은 본문을 보게 되고 조용히 틀린다. 그래서 완성기준에 양방향(포함 시 호출 / 미포함 시 미호출)을 넣었다. ② S3에서 `summary`가 JSONL 계약을 물려받아 요약이 `{"text":"…"}`로 나오는 것 — #62에서 만든 파라미터 테스트가 잡도록 새 태스크를 그 목록에 넣는다.
- **마이그레이션은 되돌림까지 확인한다** — `api/CLAUDE.md`가 "Alembic 마이그레이션은 항상 리뷰 후 커밋"을 요구한다. autogenerate 결과를 그대로 믿지 말고 SQL을 읽는다.
- **"기존 방어 안에서의 변경"이라는 이유로 실측을 면제하지 않는다**(#66 회고). S2는 기존 서비스 경로를 건드리므로, 조건 분기가 실제로 동작하는지 테스트로 양쪽을 고정한다.
- part 2/2(`chapter-summary-2of2`)가 web을 맡는다. 이 part는 web을 건드리지 않으므로 `pnpm generate`도 하지 않는다 — OpenAPI 계약이 바뀌지만 소비는 다음 part에서 한다.
