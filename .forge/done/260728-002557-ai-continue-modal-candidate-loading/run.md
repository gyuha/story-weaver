<!-- forge-slug: ai-continue-modal-candidate-loading -->
<!-- task: 60 -->
# RUN — AI 이어쓰기를 차단형 모달로 + 후보를 하나씩 로딩되게

실행 형태: Claude Code Dynamic Workflow (5 에이전트 — 구현 병렬 2 → 모달화 1 → 리뷰 1 → 조건부 수정 1).
모드: `tdd: on` (슬라이스마다 실패 테스트 선행 + 사보타주로 테스트 유효성 확인), `eco: on` (서브에이전트 `sonnet` 캡 + ECO 규율 주입).
도메인 에이전트: S1·S2·S3와 수정 전부 `web-feature-builder`. 리뷰는 기본 워크플로우 서브에이전트.
서브에이전트 토큰 545k · 툴 호출 195회 · 소요 약 35분.

## 계획대로 된 것

- **S1 `stop()` 노출** — `assist.api.ts`의 `useAssistStream`이 `stop = useCallback(() => abortRef.current?.abort(), [])`를 반환. `start()`의 이전-스트림 abort 동작과 401 refresh 경로(ADR-0007)는 무변경. 기존 `catch`의 `err.name !== 'AbortError'` 필터가 그대로 `error` 오염을 막으므로 별도 "stopped" 플래그를 만들지 않았다. `manuscript.test.tsx`의 assist 목에 `stop: stopSpy` 추가(같은 영역 회고가 경고한 함정 — 빼면 런타임에 "not a function").
- **S2 증분 파싱** — `parse-suggestions.ts`에 `parsePartialSuggestions(text, isDone): { completed: string[], growing: boolean }` 신규. `isDone`이면 기존 `parseSuggestions`에 위임해 완료 시 동작·폴백이 100% 동일. 스트리밍 중이면 마커 k개 중 앞 k-1개만 `completed`(다음 마커가 도착해 경계 확정), 마지막 세그먼트는 버림. 기존 `parseSuggestions`는 무변경.
- **S2 경계 케이스는 기존 정규식이 이미 해결하고 있었다** — 청크가 `\n2`까지만 도착한 상태(아직 `.`/`)` 없음)는 `MARKER`(`(?:^|\n)\s*\d+[.)]\s*`)가 애초에 매치하지 않아 이전 후보를 조기 확정하지 않고, 후보 본문 안의 `1.5` 같은 문자열도 `(?:^|\n)` 앵커 때문에 마커로 오인되지 않는다. 별도 로직 없이 자연 해결되며 그 성질을 테스트로 고정했다.
- **S3 모달화** — `@/components/ui/dialog`(Base UI) + `@/components/ui/skeleton`으로 A안 레이아웃 구현. `parsePartialSuggestions(rawText, !isStreaming)`로 완성 후보만 카드 렌더 + `growing`이면 스켈레톤 1개, 헤더 "N개 생성됨 · 계속 생성 중…"(총계 표기 없음), 하단 취소. **원문 `rawText`를 직접 렌더하는 분기는 없다.**
- **닫기 전 경로에서 스트림 중단** — `manuscript.tsx:120`(취소·ESC·배경 클릭이 타는 `dismissDraft`)과 `:396`(적용)에서 `assist.stop()` 호출. 사보타주로 각 경로의 테스트가 실제로 결함을 잡는지 확인했다.
- **`draftRef`·`scrollIntoView` 제거** — 인라인 패널을 화면에 보이게 하던 orphan 정리. 제목 생성 흐름(`prevStreamingRef` 전이 감지, `generatingTitle` 가드, `runContinue`↔`generateTitle` 상호 리셋)은 무변경.
- **TDD 규율 + 테스트 유효성 확인** — 세 슬라이스와 수정 단계 모두 사보타주 → FAIL 확인 → 복원을 수행하고 결과를 보고했다(`markers.length` 상한 조작, `isDone` 분기 무력화, `modal={false}`, `onOpenChange` 제거, `assist.stop()` 제거, `setTextSelection` 제거 등 8건).
- **Non-goals 무침범** — `api/` 무변경(프롬프트 `3~5개` 유지) · 다른 assist 태스크 무변경 · 제목 생성 흐름 무변경 · 모달 내 문맥 표시 없음 · 재시도 버튼 없음 · 모달 메커니즘 통일 없음 · 2열 레이아웃 없음 · `web/src/api/**`·`routeTree.gen.ts` 무변경 · 신규 의존성 0.

## 진짜 divergence — 플랜에 모순이 있었다 (책임은 그릴링)

**플랜은 "S3: `suggestion-picker.tsx`를 `ui/dialog.tsx` 기반 모달로 **바꾼다**"고 썼으면서 동시에 Non-goals에 "`selection-ai-menu.tsx` 무변경"을 선언했다. 이 둘은 서로 모순이다** — `selection-ai-menu.tsx:2,91`이 `SuggestionPicker`를 import해 쓰고 있기 때문이다(선택 영역 AI 메뉴: 다시쓰기·늘리기·줄이기·톤변경). 그릴링 단계에서 `suggestion-picker.tsx`와 `manuscript.tsx`는 읽었지만 **`SuggestionPicker`의 다른 소비자를 grep하지 않았다.**

S3 에이전트가 이걸 발견해 올바르게 해소했다: 기존 `SuggestionPicker`(인라인, `rawText` 스트리밍 렌더)를 **그대로 두고**, 같은 파일에 신규 `ContinueSuggestionModal`을 추가해 `manuscript.tsx`만 그것을 쓰게 했다. 결과적으로 두 요구(모달화 + selection-ai-menu 무변경)를 동시에 만족했고 `selection-ai-menu.test.tsx` 15건이 회귀 없이 green이다.

**부작용으로 남은 것**: 이제 같은 파일에 후보 선택 UI가 두 벌(인라인 `SuggestionPicker` + 모달 `ContinueSuggestionModal`) 공존한다. `SuggestionPicker`는 여전히 스트리밍 원문을 그대로 흘리므로, **선택 영역 AI 메뉴 경로에는 이번 "하나씩 로딩" 개선이 적용되지 않았다.** 사용자가 요청한 것은 "이어쓰기"였으므로 범위 위반은 아니지만, 같은 제품 안에 두 가지 연출이 공존한다는 사실은 기록해 둔다.

## 리뷰에서 잡은 결함 (조건부 코드리뷰 — 원고 삽입·토큰 누출 = 위험 영역)

**major / mustFix 1건, in-run 수정 완료.**

- `parsePartialSuggestions`가 스트리밍 중이면서 `rawText`가 아직 빈 문자열인 상태를 `growing: false`로 특별 취급했다(`if (!text.trim()) return { completed: [], growing: false }`). 이 상태는 **사용자가 `AI 이어쓰기`를 누른 직후 첫 SSE 토큰이 도착하기 전 항상 지나가는 구간**이다(`start()`가 `setText('')`+`setIsStreaming(true)`를 동기 실행하고 첫 네트워크 왕복 전까지 — LLM TTFT 통상 수백ms~수초).
- 결과: 매 클릭마다 100% 재현되는 **완전한 빈 박스**. 헤더는 "0개 생성됨 · 계속 생성 중…"이라고 말하면서 본문엔 카드도 스켈레톤도 스피너도 없다. 리뷰어가 `<ContinueSuggestionModal open isStreaming rawText="" />`로 직접 재현 확인했다. **이번 작업의 핵심 요구를 시작 지점에서 어기는 결함**이고, 사용자에게는 멈춘 모달로 보인다.
- 수정: 특별분기 4줄 삭제 → 빈 문자열도 `markers.length < 2` 경로로 흘러 `growing: true`가 되고 스켈레톤이 즉시 뜬다. 결함 고정 테스트 추가(수정 전 FAIL 확인).
- **이 결함은 jsdom 테스트 14건이 전부 green인 상태로 살아 있었다.** 테스트가 "마커 0~1개" 케이스는 덮었지만 "빈 문자열 + 스트리밍 중"이라는 실제 최초 상태를 아무도 렌더해 보지 않았다.
- **minor 1건(mustFix 아님)** — 리뷰어가 "플랜이 요구한 브라우저 육안 UAT(네트워크 탭 SSE 중단 확인 포함)를 아무도 수행하지 않고 전부 jsdom으로만 검증했다"고 지적했다. 정당한 지적이며, 위 major 결함이 그 간극의 실제 사례다. UAT는 오케스트레이터가 사람에게 요청하는 단계로 남긴다.

## 도중에 내린 결정 (플랜 텍스트를 넘어선 것)

- **커서 위치를 스냅샷 없이 해결했고, 그걸 실증했다.** 플랜은 방법을 지정하지 않고 "이어쓰기를 시작한 커서 위치에 정확히 삽입된다"는 관찰 가능한 목표만 줬다. S3는 TipTap `focus()` 커맨드 소스(`commands/focus.ts`의 `resolveFocusPosition`)를 읽어 `position` 인자 없이 호출하면 `editor.state.selection`(ProseMirror 모델 셀렉션)으로 폴백하고, 모델 셀렉션은 DOM blur·포커스 이동과 무관하게 유지됨을 확인했다. 그리고 **실제 TipTap 에디터 + 실제 Base UI Dialog를 조합한 하네스**로 "모달이 실제로 DOM 포커스를 가져간 상태"(`dialogPopup.contains(document.activeElement)`로 확인)에서도 본문 중간 커서에 정확히 삽입됨을 실증했다. 결론: 스냅샷 ref 불필요 → `onApply`는 기존 `insertContent(text)` 유지. **직전 회고 교훈 ①("플랜은 목표만 못박고 API 선택은 실행 단계에")이 의도한 대로 작동한 첫 사례다** — 구현자가 "알아서 유지될 것"이라 가정하지 않고 소스를 읽고 하네스로 검증했다.
- **모달 차단 메커니즘도 소스로 확인했다** — Base UI Dialog가 `modal` 기본값 `true`일 때 floating-ui-react의 `markOthers`가 바깥 형제 노드에 `aria-hidden="true"`를 건다는 것을 소스에서 확인하고, RTL의 `getByRole(..., { hidden: true })` vs 기본 쿼리 차이로 테스트했다(`modal={false}` 사보타주로 실패 확인).
- 모달을 조건부 마운트가 아니라 **항상 렌더 + `open` prop 제어**로 배선했다(Base UI Dialog의 종료 애니메이션이 정상 동작하도록).
- 배경 클릭 테스트는 jsdom에 히트테스트가 없어 바깥 버튼 클릭으로는 감지되지 않으므로 `data-slot="dialog-overlay"` 엘리먼트를 직접 클릭하도록 작성했다(Base UI `useDialogRoot.js`의 `outsidePress` 소스 확인 후).
- 테스트 하네스에서만 `scrollIntoView: false` — jsdom에 `Range.getClientRects`가 없어 TipTap 기본 `focus()` 스크롤 계산이 예외를 던진다. 운영 코드는 무변경.
- `manuscript.test.tsx`의 에러 테스트를 `getByRole(..., { hidden: true })`로 수정 — 모달이 열려 있으면 바깥 "저장" 버튼이 접근성 트리에서 정당하게 숨겨지므로.

## 규율 위반 1건 (자기보고)

**S1이 scoped-only 규칙을 위반해 저장소 전체 `pnpm typecheck`를 실행했다**고 스스로 보고했다(결과는 통과). 병렬 단계에서 전체 게이트를 돌리면 다른 에이전트의 진행 중 편집으로 오탐이 나고 그것을 고치려 드는 사고가 나기 때문에 금지한 규칙이다. 이번엔 실해가 없었고(S2는 다른 파일, S3는 아직 시작 전) 자진 신고했다. S3도 전체 `tsc --noEmit`을 돌린 뒤 grep으로 자기 파일만 필터했다고 보고했다 — 같은 위반의 완화된 형태다.

## 최종 게이트 (오케스트레이터가 직접 재실행 — 자기보고 불신)

- `pnpm typecheck` → clean
- `pnpm lint` → clean (218 files)
- `pnpm test` → **47 files / 266 tests passed** (기존 242 + 신규 24)
- 핵심 코드 직접 확인: `parsePartialSuggestions`의 `isDone` 위임·`markers.length < 2` → `growing: true`·k-1 규칙 / 모달의 `growing && <Skeleton/>`·`{completed.length}개 생성됨` / `manuscript.tsx:120`·`:396`의 `assist.stop()` / `draftRef` 제거

## 막혔던 곳 / 환경 이슈

- **fg-next의 상태 기계에 "실행 중(in flight)" 상태가 없다.** 워크플로우가 백그라운드로 도는 동안 `fg-next`를 호출하면 활성 슬롯에 `plan.md`만 있고 `run.md`가 없으므로 "아직 실행 안 됨"으로 판정해 **fg-run을 다시 invoke하려 한다**. `run.md`는 워크플로우가 끝난 뒤에 쓰이므로 재실행 가드가 이 창을 막지 못한다. 이번엔 사람이 `fg-next`를 호출했을 때 오케스트레이터가 저널을 확인해 "이미 진행 중"이라고 판단하고 멈췄지만, 자동 드라이브(`fg-next all`)라면 두 번째 워크플로우가 떠서 같은 파일을 동시 편집했을 것이다.
- **비주얼 컴패니언의 이벤트 전달 방식이 사용자에게 오해를 일으켰다.** 사용자가 "선택을 해도 값이 전달되지 않는 것 같다"고 보고했다. 실제로는 (a) 23:27 클릭은 정상 기록·수신됐고, (b) 계획 출력 시점(23:33)에 규칙대로 서버를 정지시켜 그 이후 클릭은 갈 곳이 없었고, (c) **서버가 살아 있어도 클릭은 저를 깨우지 못한다**(events 파일 append → 다음 턴에 읽음). "클릭해 고르시거나 터미널로 알려주세요"라는 안내가 클릭만으로 충분하다는 뜻으로 읽혔다.
- **커밋하지 않았다.** 워크플로우 전 단계에 git commit 금지를 걸었으므로 변경은 작업 트리에만 있다.

## 후속 작업 후보 (다음 fg-ask)

- **선택 영역 AI 메뉴(`selection-ai-menu.tsx`)의 후보 표시도 "하나씩 로딩"으로 통일** — 지금은 인라인 `SuggestionPicker`가 스트리밍 원문을 그대로 흘린다. 같은 제품에 두 연출이 공존한다.
- **한글 IME Enter 가드 전수 적용** (#58 잔여, 세 사이클 미착수) — `memory-panel.tsx:648` 채팅 전송이 최우선.
- **Makefile 기반 테스트 12건 정리** (#59 발견, 상시 red).
- `.forge/codebase/` 지도 갱신(`fg-map`) — 이제 27커밋 이상 뒤처졌고 `api/`·`web/` 양쪽이 바뀌었다.
