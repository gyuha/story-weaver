<!-- forge-slug: chapter-summary-2of2 -->
<!-- task: 68 -->
<!-- tdd: on -->
<!-- part: 2/2 -->
<!-- priority: medium -->
# 화 요약 (2/2) — 요약 버튼 배선과 검토 화면 한눈에 보기

## Goal / Non-goals
- Goal: part 1/2가 만든 저장 자리와 생성 엔드포인트를 화면에 붙인다. ① 집필 화면의 **`요약`** 칩이 실제로 요약을 생성하고, 모달로 보여준 뒤 **`적용`**을 눌러야 저장된다 ② **`검토 · 타임라인`** 화면에 **화별 요약** 섹션을 추가해 작품 전체 흐름을 한 번에 훑게 한다 — 요약이 아직 없는 화도 함께 보여 빈 곳이 드러나게 한다.
- Non-goals: **백엔드 무변경**(part 1/2에서 끝냄) · 요약 자동 생성 없음 — `요약` 칩을 눌렀을 때만 · 검토 화면에서 요약을 직접 편집·삭제하는 기능 없음(읽기 전용) · 요약 카드에서 해당 화로 이동하는 링크는 넣지 않음(충돌 callout의 "이동"도 아직 목업이다 — `timeline-screen.tsx:43`) · 여러 화 일괄 요약 없음 · 요약 이력·되돌리기 없음(덮어쓰기) · `reviewSummary` 통계에 "요약된 화 수"를 추가하지 않음(통계 3개 유지) · 새 ADR 없음.

## Source of truth
- Glossary: `.forge/CONTEXT.md` — **화 요약 (Chapter Summary)** 항목을 이 part에서 **신설**한다(part 1/2는 화면이 없어 미뤘다). 정의는 "한 화에서 무슨 일이 일어났는지를 2~3문장으로 적은 서술"이며, **타임라인 상태**(엔티티의 시점별 키-값 사실)와 엔티티 카드의 `summary`(한 줄, 임베딩 대상)와 **명시적으로 구분**한다. 셋이 같은 화면·같은 단어를 쓰기 때문에 구분하지 않으면 반드시 혼동된다.
- Related ADRs: `0012-ai-chapter-title-as-assist-task`(assist 태스크 재사용 — part 1/2가 그 선례로 엔드포인트를 만들었다). **새 ADR 없음.**

### 착수 전 조사로 확정된 사실 (전부 파일·줄 확인)
- **`요약` 칩은 목업이다** — `manuscript.tsx:318-319`이 `label="요약"` + `onClick={() => toast('요약 생성 (목업)')}`. 실제 동작이 없다.
- **화면 이름은 `검토 · 타임라인`이다** — 좌측 네비 레이블(`work-shell.tsx:47`), 라우트 `/works/$workId/timeline`, 페이지 제목은 `검토`(`timeline-screen.tsx:18,23`). 사용자가 말한 "검토 타임라인"은 이 네비 레이블을 그대로 인용한 것이다(용어를 지어낸 것이 아님).
- **검토 화면 현재 구성** — `통계 3개(화·타임라인 상태 기록·충돌 후보)` → `충돌 후보 callout` → `최근 타임라인 상태 기록 테이블`(`timeline-screen.tsx:28-90`). 요약 섹션은 **충돌 아래·상태 테이블 위**에 넣는다(그릴링에서 배치안 3개를 비교해 선택).
- **모달은 이미 있다** — `ContinueSuggestionModal`이 `title` prop을 받아 이어쓰기·다시쓰기·늘리기·줄이기·톤 변경이 공유한다(task #66에서 통일). 후보가 1개인 응답도 파서의 폴백 계층이 카드 1장으로 렌더한다 — `style` 태스크가 이미 그렇게 동작한다. **요약도 단일 텍스트라 그대로 재사용된다.**
- **`Chapter` 타입에 `summary`가 없다** — `web/src/features/shared/types.ts`의 `Chapter`는 `id·episodeId·partLabel·index·title·status·paragraphs·linkedEntityIds·vectorMemory`. 추가가 필요하다.
- **`src/api/`는 생성물이라 직접 편집 금지**(`CLAUDE.md`) — part 1/2가 OpenAPI를 바꿨으므로 이 part에서 `pnpm generate`를 돌린다.

### 결정 요약 (그릴링 합의)
- **`요약` 칩 → 모달 → `적용` 시 저장.** 요약은 덮어쓰기라 버튼 한 번에 기존 요약이 날아가면 되돌릴 방법이 없다. 이어쓰기와 같은 모달을 재사용하므로 배선 비용이 낮다.
- **검토 화면 배치는 `충돌 아래 · 상태 테이블 위`.** 경고(충돌) → 흐름(요약) → 세부(타임라인 상태) 순서. 급한 것이 위, 읽는 것이 가운데, 참조용 데이터가 아래.
- **요약 없는 화도 목록에 넣는다.** 어디가 비었는지 보이는 것이 "한번에 보기"의 절반이다.

## Definition of Done
- 집필 화면에서 `요약`을 누르면 모달이 뜨고, 생성된 요약을 보고 `적용`을 눌러야 저장된다. 취소하면 저장되지 않는다.
- `검토 · 타임라인` 화면에 **화별 요약** 섹션이 화 순서대로 뜨고, 요약이 없는 화는 없음이 드러나게 표시된다.
- 저장한 요약이 새로고침 후에도 남는다(서버 저장 확인).
- web `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과. `src/api/`는 `pnpm generate` 산출물만 바뀐다(손으로 고치지 않는다).

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. SDK 재생성 + 타입 배선 — 백엔드 OpenAPI를 갱신해 `pnpm generate`를 돌리고, `Chapter` 타입에 `summary?: string`을 추가한 뒤 스토어가 서버 응답의 `summary`를 채우도록 한다. `src/api/` 생성물은 직접 편집하지 않는다. — completion criterion: vitest — ① 스토어가 서버 챕터 응답의 `summary`를 `Chapter.summary`로 옮긴다, ② `summary`가 없는 응답도 깨지지 않는다(`undefined` 허용), ③ `pnpm typecheck` clean. (depends: none — part 1/2가 먼저 끝나 있어야 함)
- [ ] S2. `요약` 칩 → 모달 → 적용 저장 — `manuscript.tsx:318`의 목업 `onClick`을 실제 동작으로 바꾼다. 현재 에디터 본문을 `assist('summary')`로 보내고, `ContinueSuggestionModal`을 `title="AI 요약"`으로 띄운 뒤 `적용` 시 `PATCH chapters/{id}`로 `{ summary }`를 저장하고 스토어를 갱신한다. 취소는 스트림을 끊고 저장하지 않는다(#65·#66에서 만든 `stop` 규약). — completion criterion: vitest — ① `요약` 클릭 시 `summary` 태스크로 현재 본문이 전달된다, ② 모달 헤더가 `AI 요약`이다, ③ `적용` 시 `updateChapter`가 `{ summary }`로 호출되고 `body`는 보내지 않는다(**part 1/2 S2의 재색인 절약이 무의미해지지 않도록**), ④ `취소` 시 저장하지 않고 `stop`이 호출된다, ⑤ 본문이 비어 있으면 생성하지 않고 안내한다(이어쓰기의 기존 가드와 같은 결). (depends: S1)
- [ ] S3. 검토 화면 화별 요약 섹션 — `timeline-screen.tsx`의 충돌 callout과 `최근 타임라인 상태 기록` 사이에 **화별 요약** 섹션을 넣는다. 작품의 모든 화를 순서대로(부 → 화 순) 보여주고, 각 행은 `{index}화 · {title}`과 요약 본문, 요약이 없으면 `요약 없음`을 흐리게 표시한다. — completion criterion: vitest — ① 화가 순서대로 렌더된다, ② 요약이 있는 화는 요약 본문이 보인다, ③ 요약이 없는 화는 `요약 없음`이 보인다, ④ 화가 하나도 없으면 섹션이 빈 안내를 보여주고 깨지지 않는다, ⑤ 섹션이 충돌 callout **뒤**, 상태 테이블 **앞**에 온다(DOM 순서 단정). (depends: S1)

## 검증 노트 (직전 회고 반영)
- **UAT 지시에 화면 경로와 코드에서 읽은 레이블을 인용한다**(#66 회고 — 위치를 뭉뚱그려 써서 사용자가 다른 화면을 테스트하는 바람에 UAT 한 라운드가 버려졌다). 이 작업의 UAT 경로는 **집필 화면(`/works/{workId}/write/{chapterId}`) 상단 칩 줄의 `요약`** → 그리고 **좌측 네비의 `검토 · 타임라인`**(`/works/{workId}/timeline`)이다. `저장`·`장면 이미지`·`다시쓰기`·`버전 기록`이 같은 줄에 있으니 `요약`을 정확히 집어야 한다.
- **가장 그럴듯한 사고는 S2의 저장 페이로드다.** `updateChapter`에 `body`를 같이 실어 보내면 part 1/2 S2가 아낀 재임베딩이 매 요약마다 다시 발생한다 — 화면상으로는 멀쩡해 보이므로 조용히 낭비된다. 완성기준 ③으로 못박았다.
- **두 번째는 요약이 JSONL로 렌더되는 것이다.** 모달은 `parsePartialSuggestions`를 쓰므로, part 1/2 S3에서 요약 지시문에 JSONL 계약이 새어 들어갔다면 요약이 `{"text":"…"}` 카드로 뜬다. part 1/2의 완성기준이 이를 막지만, 이 part의 UAT에서 눈으로도 확인한다.
- **`retro-hint`를 붙이지 않았다** — 화면·저장·글로서리가 함께 움직이는 작업이라 배울 것이 남을 가능성이 높다.
