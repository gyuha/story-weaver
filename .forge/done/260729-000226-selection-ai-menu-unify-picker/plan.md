<!-- forge-slug: selection-ai-menu-unify-picker -->
<!-- task: 61 -->
<!-- tdd: on -->
<!-- priority: high -->
# 선택 영역 AI 메뉴: 팝오버 헤더를 액션별로 + 이어쓰기와 연출 통일

## Goal / Non-goals
- Goal: 본문 선택 후 **다시쓰기·늘리기·줄이기·톤 변경** 중 무엇을 눌러도 결과 팝오버 헤더가 "AI 이어쓰기"로 뜨는 문제를 고친다. ① 헤더를 **액션별 라벨**로("AI 다시쓰기"·"AI 늘리기"·"AI 줄이기"·"AI 톤 변경") ② 스트리밍 중 **원문 blob 노출을 제거**하고 이어쓰기 모달과 같은 "완성 후보 카드 + 스켈레톤" 연출로 통일 ③ 팝오버를 닫을 때 SSE 스트림을 실제로 중단.
- Non-goals: **팝오버를 모달로 바꾸지 않음** — 다시쓰기·줄이기·톤 변경은 선택 영역을 *교체*하는 동작이라 원문이 옆에 보이는 것이 판단에 필요하다(딤으로 가리면 손해). 그래서 위치·크기(`fixed`, 300px, `coordsAtPos` 기준)는 유지 · **팝오버와 모달의 공통 내용부를 공유 컴포넌트로 추출하지 않음**(사용자 선택 — 카드 마크업은 이미 두 곳에 중복돼 있고 이번에 늘어나는 중복은 스켈레톤 한 줄 수준. 세 번째로 연출이 어긋나면 그때 추출한다) · 모달에 "N개 생성됨" 부제를 팝오버로 가져오지 않음(폭 300px, style은 결과 1개라 "1개 생성됨"이 어색) · 백엔드 무변경(특히 `style` 태스크 프롬프트에 다중 후보 지시를 추가하지 않음) · 후보 카드에 원문↔제안 대비 UI 추가 없음 · 늘리기의 `prefix` 삽입 방식 무변경 · `manuscript.tsx`의 이어쓰기 모달 무변경

## Source of truth
- Glossary terms: **AI 이어쓰기 (Continue)** in `.forge/CONTEXT.md` — "작가가 후보를 채택한다"는 정의가 이 화면에도 적용된다(고르기 전까지 원고는 바뀌지 않는다). 다만 선택 영역 액션 4종에 대한 글로서리 용어는 없다 — 이번에도 만들지 않는다(UI 표현 수준의 라벨이지 도메인 개념이 아니다).
- Related ADRs: `0012-ai-chapter-title-as-assist-task.md`(assist 태스크·`useAssistStream` 공유 구조) · `0007-frontend-session-token-handling.md`(assist SSE 401 갱신 — `stop()` 도입이 이 경로를 깨지 않아야 한다). **새 ADR 없음** — 라벨 prop화·연출 통일 모두 되돌리기가 몇 줄이라 3조건 게이트 미충족.
- 착수 전 코드 확인으로 확정된 사실:
  - **원인**: `web/src/features/editor/components/suggestion-picker.tsx:21-23`이 헤더를 `AI 이어쓰기{isStreaming ? ' · 생성 중…' : ''}`로 **하드코딩**한다. `selection-ai-menu.tsx:91`이 이 컴포넌트를 그대로 쓰므로 네 액션 모두 같은 헤더가 나온다.
  - **네 액션은 실제로 두 종류다**: 늘리기 → `continue` 태스크(`selection-ai-menu.tsx:63`), 다시쓰기·줄이기·톤 변경 → `style` 태스크(`:68`, `targetStyle` 지시문만 다름 — `:22-24`).
  - **후보 개수가 다르다**: `continue`는 백엔드 프롬프트가 "다음 문장 3~5개 후보"라 여러 개, `style`은 "의미와 사건은 보존한 채 어휘·어조·문장 리듬만 목표 문체로 재작성"뿐이라 **결과가 하나**다 → `parseSuggestions`의 마커 분리가 후보 1개로 폴백한다. 스켈레톤은 `parsePartialSuggestions`가 이미 이 경우를 정확히 처리한다(마커 없음 → 스트리밍 중 완성 0개 + `growing: true`, 종료 시 후보 1개).
  - **삽입 방식이 이어쓰기와 다르다**: `insertContentAt({ from, to }, prefix + text)`(`:99`)로 **선택 영역을 교체**한다. 늘리기만 `prefix`에 선택 텍스트+공백을 넣어 보존한다(`:55`).
  - **카드·버튼 어휘는 이미 동일하다**: 두 컴포넌트를 대조하면 후보 카드(`rounded-md border border-line-strong p-2`), 본문(`text-[13px] leading-[1.6] text-ink`), 적용 버튼(`h-7 rounded-[5px] bg-primary px-2.5 text-[12px]`), 취소 버튼(`h-8 rounded-[5px] border border-line-strong px-3 text-[12.5px]`)이 같다. 실질 차이는 **헤더 형태**와 **스트리밍 중 렌더**뿐이다.
  - **`stop()` 미호출**: `onCancel={() => setPreview(null)}`(`:103`)이 스트림을 끊지 않는다. #60이 `useAssistStream`에 `stop()`을 노출하고 이어쓰기 경로에만 배선했다.
  - **기존 테스트가 구 동작을 곁쇄한다**: `__tests__/selection-ai-menu.test.tsx:108-118`의 `'스트림 청크가 도착하는 대로 미리보기에 점진적으로 반영된다'`가 `expect(screen.getByText('그가')).toBeInTheDocument()`로 **원문 blob 렌더를 단정한다**. 나머지 6건은 액션 라벨로 버튼을 찾고 헤더 텍스트를 단정하지 않아 안전하다.
- 결정 요약(그릴링 합의):
  - **통일 수준 = 팝오버 유지 + 라벨·연출 통일.** 모달로 바꾸지 않는다(위 Non-goals의 원문 가림 이유).
  - **헤더 라벨은 "AI " 접두를 붙인다** — "다시쓰기"만 쓰면 AI 산출물인지 모호하고 "AI 이어쓰기"와 형태가 어긋난다. 색 `text-ai`, 기존 한 줄 형태(`… · 생성 중…`) 유지.
  - **연출 통일** — 스트리밍 중 원문 blob 렌더 분기를 삭제하고 `parsePartialSuggestions`로 완성 후보만 카드 + `growing`이면 스켈레톤 1개.
  - **닫기 = 스트림 중단** — #60에서 이어쓰기에 대해 내린 결정을 이 경로에도 적용한다(요청 범위보다 넓지만 "동작 통일"의 일부).
  - **깨지는 테스트 1건은 새 요구사항으로 다시 쓴다** — 통과시키려고 blob 렌더를 살리는 것이 가장 그럴듯한 실패 경로이므로 완성기준에 명시한다.
- Definition of Done:
  - 선택 후 **다시쓰기·늘리기·줄이기·톤 변경** 각각을 눌렀을 때 팝오버 헤더가 그 액션 이름으로 뜬다(브라우저 육안 4회).
  - 생성 중 **원문 텍스트가 팝오버에 보이지 않고** 스켈레톤이 뜨며, 완료되면 후보 카드가 나온다(브라우저 육안 — 늘리기는 여러 후보, 나머지는 1개).
  - 취소로 팝오버를 닫으면 **Network 탭에서 assist SSE 요청이 cancelled**된다(브라우저 육안).
  - 적용하면 **선택 영역이 교체**되고, 늘리기는 선택 텍스트가 앞에 보존된다(기존 동작 회귀 없음).
  - `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 헤더 라벨 prop화 + 액션별 전달 — `suggestion-picker.tsx`의 `SuggestionPicker`가 헤더 라벨을 prop으로 받게 한다(하드코딩 제거). 기본값을 두지 말고 **필수 prop**으로 해서 호출부가 반드시 정하게 한다(누락 시 타입 에러로 잡힌다). `selection-ai-menu.tsx`의 `ACTIONS`에 헤더용 라벨을 추가하거나 기존 `label`에서 파생시켜 넘긴다("AI " + 액션명). — completion criterion: 테스트 — 네 액션 각각을 클릭한 뒤 팝오버 헤더가 해당 액션 이름을 포함하고 "AI 이어쓰기"가 **아닌지** 확인(4건). 기존 7건 green 유지. (depends: none)
- [ ] S2. 스트리밍 연출 통일 + 닫기 시 스트림 중단 — `SuggestionPicker`의 `isStreaming` 분기에서 `rawText` 직접 렌더를 **삭제**하고 `parsePartialSuggestions(rawText, !isStreaming)`로 완성 후보 카드 + `growing`이면 `Skeleton` 1개(모달과 같은 `h-16 w-full rounded-md`). `selection-ai-menu.tsx`의 `onCancel`이 `assist.stop()`을 호출하게 하고, `onApply`에도 붙인다(적용 시점에 스트리밍 중일 수 있다). — completion criterion: 테스트 — ① **`:108-118`의 기존 테스트를 새 요구사항으로 다시 쓴다** — 스트리밍 중 원문 문자열이 화면에 **없고** 스켈레톤이 있으며, 완료 시 후보 카드가 나온다(blob 렌더를 살려 통과시키면 안 된다), ② 취소 클릭 시 `stop()`이 호출된다, ③ 적용 클릭 시에도 `stop()`이 호출되고 `insertContentAt`이 기존과 동일한 인자로 불린다(회귀), ④ style 응답(마커 없음)이 완료 시 후보 1개로 뜬다, ⑤ 에러 시 카드 없이 메시지만(기존 테스트 유지). `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 green. (depends: S1 — 같은 두 파일을 편집하므로 순차)

## 검증 노트 (직전 회고 반영)
- **플랜은 관찰 가능한 목표만 못박았다** — 헤더 라벨을 `ACTIONS`에 새 필드로 둘지 기존 `label`에서 파생할지, prop 이름을 무엇으로 할지는 지정하지 않는다(retro `260727-000846` 교훈 ①: 플랜이 구체 API를 지정하면 구현자가 그것을 검증 면제 대상으로 취급한다).
- **테스트 green을 검증 증거로 쓰지 않는다** — 헤더가 실제로 그렇게 보이는지, 스켈레톤이 뜨는지, 취소가 정말 SSE를 끊는지는 브라우저 육안 UAT가 필수다. #60에서 jsdom 테스트 14건 green 상태로 "빈 박스" major 결함이 살아 있었다.
- **바꿀 컴포넌트의 다른 소비자를 확인했다** — `SuggestionPicker`의 소비자는 `selection-ai-menu.tsx` **하나**뿐이다(`manuscript.tsx`는 #60에서 `ContinueSuggestionModal`로 갈라졌다). #60의 플랜이 이 확인을 빠뜨려 모순된 계획을 만들었으므로 이번엔 착수 전에 grep으로 확정했다.
- 이번 작업에는 텍스트 입력 UI가 없어 한글 IME 가드는 해당 없다(여전히 미착수인 4곳은 별건 백로그 후보).
