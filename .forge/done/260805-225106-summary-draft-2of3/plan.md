<!-- forge-slug: summary-draft-2of3 -->
<!-- task: 70 -->
<!-- tdd: on -->
<!-- part: 2/3 -->
<!-- priority: medium -->
# 늘려쓰기 (2/3) — 요약을 직접 편집·저장

## Goal / Non-goals
- Goal: 요약 모달을 **읽기 전용에서 편집 가능**으로 바꾼다. 저장된 요약이 편집란(textarea)에 들어 있고, 작가가 직접 고쳐 `저장`할 수 있다. `AI 요약` 결과도 편집란에 들어와 손본 뒤 저장한다 — 즉 지금의 `적용` 단계가 `저장`으로 합쳐지고 `done` 단계가 사라진다.
- Non-goals: **`늘려쓰기` 버튼은 part 3/3** — 이 파트에서는 자리도 만들지 않는다 · 백엔드 무변경(`saveChapterSummary`·`chapters.summary`가 이미 있다) · 요약 길이 제한·글자 수 표시 없음 · 요약 편집 이력·되돌리기 없음(textarea의 기본 undo에 맡긴다) · 검토 화면에서 요약을 편집하는 기능 없음(집필 화면의 모달에서만) · 자동 저장 없음 — `저장`을 눌러야 저장된다 · 새 ADR 없음.

## Source of truth
- Glossary: **화 요약 (Chapter Summary)** — 이번 그릴링에서 `.forge/CONTEXT.md`에 신설했다. "작가가 직접 쓰거나 AI가 본문을 근거로 지어 주며"가 이 파트의 근거다 — 요약은 AI 전용 산출물이 아니라 작가가 소유하는 텍스트다.
- Related ADRs: 없음(UI 형태 변경). **새 ADR 없음** — 되돌리기가 싸고 트레이드오프가 크지 않다.

### 착수 전 조사로 확정된 사실 (전부 파일·줄 확인)
- **현재 모달은 4단계 읽기 전용이다** — `summary-modal.tsx`가 `phase: 'idle' | 'generating' | 'done'`을 받아 `idle`엔 저장된 요약, `done`엔 생성 결과를 보여주고 `적용`으로 저장한다. 텍스트는 `<div data-testid="summary-body">`에 렌더돼 편집할 수 없다.
- **`textarea.tsx` UI 프리미티브가 있다** — `web/src/components/ui/`에 존재(`ls`로 확인). 새로 만들 필요 없다.
- **저장 경로가 이미 있다** — `saveChapterSummary(workId, chapterId, summary)`가 요약만 PATCH한다(`works.store.ts`). **`body`를 함께 실으면 서버가 본문을 재임베딩한다**(task #67 S2) — 이 파트에서도 그 규약을 지킨다.
- **모달의 완료 감지는 전용 ref를 쓴다** — `prevSummaryStreamingRef`(`manuscript.tsx`). 제목 생성의 `prevStreamingRef`와 공유하면 서로의 스트림 전이를 훔쳐 완료를 놓친다(직전 작업에서 확인).

### 결정 요약 (그릴링 합의)
- **편집란 하나 + 직업 4개** 구조로 간다(그릴링에서 배치안 3개를 비교해 선택). 이 파트에서는 그중 셋(`AI 요약`·`저장`·`닫기`)을 만들고 `늘려쓰기`는 part 3/3에서 붙인다.
- **`AI 요약` 결과는 편집란에 바로 채운다.** 그러면 "생성 결과를 확인하고 저장한다"는 직전 결정이 유지되면서(`저장` 버튼이 그 역할) 손볼 수도 있고, `done` 단계가 없어진다. 생성 결과가 편집 중 내용을 덮어쓰는 것은 허용한다 — textarea의 기본 undo(⌘Z)가 있어 위험도가 낮다.
- **`닫기`는 저장하지 않는다.** 편집만 하고 닫으면 버려진다 — 요약은 덮어쓰기이므로 확인 없이 저장하지 않는다는 규약을 유지한다.

## Definition of Done
- 모달을 열면 저장된 요약이 **편집 가능한** 상태로 들어 있고, 고쳐서 `저장`을 누르면 서버에 반영된다.
- 저장된 요약이 없으면 편집란이 **비어 있다**(직전 작업의 "빈 상자" 결정 유지).
- `AI 요약`을 누르면 생성 결과가 편집란에 들어오고, 손본 뒤 `저장`할 수 있다.
- `닫기`는 편집 내용을 저장하지 않는다.
- `저장`이 요약만 PATCH한다 — `body`를 보내지 않는다.
- web `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 모달을 편집 가능하게 — `summary-modal.tsx`의 `<div data-testid="summary-body">`를 `Textarea`로 바꾸고, 값을 내부 상태로 들되 `open`이 열릴 때와 `existingSummary`가 바뀔 때 저장된 요약으로 초기화한다. `phase`에서 `done`을 없애고 `idle | generating`으로 줄인다. 버튼은 `AI 요약` · `저장` · `닫기`. — completion criterion: vitest — ① 저장된 요약이 편집란의 값으로 들어온다, ② 저장된 요약이 없으면 값이 빈 문자열이다, ③ 타이핑하면 값이 바뀐다, ④ `생성 중`에는 편집란이 비활성이고 `AI 요약`·`저장`이 눌리지 않는다, ⑤ `저장` 클릭 시 편집란의 **현재 값**으로 `onSave`가 불린다, ⑥ `닫기`는 `onSave`를 부르지 않는다. (depends: none)
- [ ] S2. 생성 결과를 편집란에 채우기 — `manuscript.tsx`에서 `AI 요약` 스트림이 끝나면(`prevSummaryStreamingRef` 전이) 결과를 편집란 값으로 넣는다. `phase`를 `idle`로 돌린다. 실패 시 에러를 보여주고 편집 내용을 건드리지 않는다. — completion criterion: vitest — ① `AI 요약` → 스트림 완료 후 편집란에 생성문이 들어 있다, ② 그 상태에서 `저장`을 누르면 생성문으로 `saveChapterSummary`가 불린다, ③ 생성 실패 시 편집란 값이 그대로 남고 에러가 보인다, ④ 본문이 비어 있으면 생성하지 않고 안내한다(기존 가드 유지). (depends: S1)
- [ ] S3. 저장 배선 — `저장` 클릭 시 `saveChapterSummary`로 요약만 PATCH하고 성공 토스트를 낸다. 저장 후 모달은 열린 채로 두되 편집란 값은 유지한다(연달아 손보는 흐름을 끊지 않는다). — completion criterion: vitest — ① `saveChapterSummary(work.id, chapter.id, <편집란 값>)`으로 불린다, ② `manuscriptApi.updateChapter`가 직접 호출되지 않는다(**`body` 동봉 금지 규약** — task #67 S2의 재임베딩 절약을 지킨다), ③ 저장 실패 시 에러 토스트가 뜨고 모달이 닫히지 않는다. (depends: S1)

## 검증 노트 (직전 회고 반영)
- **UAT 경로와 레이블을 코드에서 인용한다**(#66 회고 — 위치를 뭉뚱그려 써서 한 라운드를 버렸다). 이 파트의 UAT는 **집필 화면(`/works/{workId}/write/{chapterId}`) 상단 칩 줄의 `요약`**에서 시작한다. 그 줄에는 `저장 · 요약 · 장면 이미지 · 다시쓰기 · 버전 기록`이 있으니 두 번째를 집어야 한다. 모달 안 버튼 레이블은 `AI 요약` · `저장` · `닫기`다.
- **가장 그럴듯한 사고는 저장 페이로드다** — `body`를 함께 실어 보내면 task #67 S2가 아낀 재임베딩이 요약 저장마다 되살아나고 **화면상으로는 멀쩡해 보인다**. 완성기준 S3-②로 못박았다. 직전 작업에서 이 방어가 실재하는지(동봉 시 red) 확인했으므로 회귀만 지키면 된다.
- **두 번째는 편집란 초기화 타이밍이다** — `existingSummary`가 바뀔 때만 초기화하면 사용자가 편집 중인 내용을 스토어 갱신이 덮어쓸 수 있고, `open`에만 걸면 화를 옮겨도 옛 요약이 남는다. 완성기준 S1-①②로 양쪽을 고정한다.
- **`AssistTaskType`류의 "테스트는 통과하는데 typecheck가 잡는" 함정은 이 파트에 없다** — 새 태스크를 쓰지 않는다. part 3/3에서 `draft`를 붙일 때 다시 조심한다.
