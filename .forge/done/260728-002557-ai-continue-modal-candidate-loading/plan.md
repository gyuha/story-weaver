<!-- forge-slug: ai-continue-modal-candidate-loading -->
<!-- task: 60 -->
<!-- tdd: on -->
# AI 이어쓰기를 차단형 모달로 + 후보를 하나씩 로딩되게

## Goal / Non-goals
- Goal: `AI 이어쓰기`를 편집 화면 아래 인라인 패널에서 **편집을 차단하는 중앙 모달**로 옮기고, 스트리밍 원문을 그대로 흘려보내던 표시를 **완성된 후보가 하나씩 카드로 채워지는 로딩 연출**로 바꾼다. 모달을 닫으면 SSE 스트림을 실제로 끊는다.
- Non-goals: 프롬프트의 후보 개수(`3~5개`)를 고정하지 않음 — **백엔드 무변경** · 다른 assist 태스크(`infill`·`dialogue`·`style`·`correct`·`title`)는 모달로 바꾸지 않음 · 제목 생성 흐름 변경 없음(같은 `useAssistStream` 공유 유지) · 모달 안에 이어쓸 위치의 본문 문맥 표시 없음(A안 선택) · 에러 시 재시도 버튼 없음(현행 에러 메시지 유지) · 저장소의 모달 메커니즘 3종 통일 없음(이번엔 `ui/dialog`만 사용) · 후보 2열 비교 레이아웃(B안) 없음 · `selection-ai-menu.tsx` 무변경

## Source of truth
- Glossary terms: **AI 이어쓰기 (Continue)** — 이번 그릴링에서 `.forge/CONTEXT.md`에 추가함. 정의의 핵심은 "AI가 이어 쓴다"가 아니라 **"작가가 후보를 채택한다"**(고르기 전까지 원고는 바뀌지 않는다) — 이번 작업의 모달·로딩 연출은 전부 *고르는 행위*를 위한 장치다. 그 외 [[편집 모드]]·[[메모리]] 기존 정의를 따른다.
- Related ADRs: `0012-ai-chapter-title-as-assist-task.md`(제목이 같은 assist SSE·`useAssistStream`을 공유한다는 결정 — 이번 변경이 그 공유를 깨지 않아야 한다) · `0007-frontend-session-token-handling.md`(assist SSE의 401 갱신 경로 — `stop()` 도입이 이 경로를 깨지 않아야 한다). **새 ADR 없음** — `ui/dialog` 선택·증분 파싱은 되돌리기가 몇 줄이라 3조건 게이트 미충족.
- 착수 전 코드 확인으로 확정된 사실:
  - 현재 `SuggestionPicker`(`web/src/features/editor/components/suggestion-picker.tsx`)는 `isStreaming` 동안 `rawText`를 그대로 렌더하고(`:28-30`), 완료 후 `parseSuggestions(rawText)`로 카드 분리(`:32-47`). 렌더 위치는 `manuscript.tsx:392` — 에디터 아래 인라인(`mt-4`)이라 **편집이 전혀 차단되지 않는다.**
  - **`useAssistStream`은 abort를 노출하지 않는다.** `AbortController`를 갖고 있지만(`assist.api.ts:163`) `start()`가 *다음* 호출 때 이전 스트림을 끊는 용도뿐이다(`:167`). 그래서 `dismissDraft`(`manuscript.tsx:120`)는 패널만 닫고 **SSE는 끝까지 돌아 토큰을 태운다.**
  - **후보 총 개수를 미리 알 수 없다** — `prompt_assembler.py:37`이 `"다음 문장 3~5개 후보를 생성하세요"`. 그래서 스켈레톤은 고정 개수로 깔 수 없다.
  - `parseSuggestions`(`lib/parse-suggestions.ts`)는 `(?:^|\n)\s*\d+[.)]\s*` 마커로 자르고, **마커가 2개 미만이면 전체를 후보 1개로 반환**한다(`:8`). 증분 파싱은 이 폴백을 그대로 존중해야 한다.
  - 모달 메커니즘이 이미 셋 공존한다: `stores/modal-store`+`ui/modal/*`(Zustand 스택, `work-tree.tsx`), `ui/dialog.tsx`(Base UI, `command.tsx` 내부에서만), `ui/alert-dialog.tsx`(`account-screen.tsx`). 스켈레톤은 `ui/skeleton.tsx`가 이미 있다.
  - 제목 생성과의 충돌은 모달이 자동으로 해소한다 — 제목 생성 중엔 `disabled={assist.isStreaming}`(`manuscript.tsx:311`)로 이어쓰기 버튼이 막히고, 이어쓰기 모달이 열리면 편집 화면이 차단돼 제목 버튼에 손이 닿지 않는다. 서로를 끄는 `setGeneratingTitle(false)`/`setShowDraft(false)` 짝은 그대로 둔다. `stop()`의 `isStreaming` true→false 전이도 제목 감지 effect가 `generatingTitle` 플래그로 가드돼 있어 안전하다(`manuscript.tsx:136-139`).
- 결정 요약(그릴링 합의):
  - **모달 구현 기반 = `components/ui/dialog.tsx`**(Base UI, controlled). `useModal`은 스토어에 JSX를 넣는 구조라 스트리밍 중 계속 바뀌는 `assist.text`/`isStreaming`을 넘기려면 스트림 상태를 스토어로 올려야 해서 범위 밖. `Dialog`는 `open` prop 제어라 지금 훅 상태를 그대로 넘기면 되고 포커스 트랩·ESC·backdrop을 얻는다.
  - **레이아웃 A안**(비주얼 컴패니언에서 선택, 목업: `.forge/visual/18346-1785161690/content/modal-layout.html`): 폭 ~560px 좁은 중앙 모달, 후보 **세로 스택**, 편집 화면은 딤+클릭 차단. B안(넓은 2열)은 후보 개수가 3~5로 가변이라 빈 칸이 생기고, C안(우측 시트)은 문맥을 보여주려 옆에 붙였는데 딤으로 가려야 해 이점이 상충한다.
  - **닫기 정책 = 자유 + 스트림 중단.** 생성 중에도 ESC·바깥 클릭·취소로 닫을 수 있고, 닫으면 `stop()`으로 SSE를 abort한다. 갇히는 모달은 생성이 늦거나 실패할 때 사용자를 인질로 잡는다.
  - **로딩 연출 = 증분 파싱 + 스켈레톤 1개.** 마커가 k개 발견되면 앞의 k-1개는 경계가 확정된 완성 후보이므로 즉시 카드로(적용 버튼 활성), k번째는 자라는 중이므로 스켈레톤 1개로 표시. **원문 blob은 한 글자도 노출하지 않는다.** 헤더는 총 개수를 모르므로 "N개 생성됨 · 계속 생성 중…" 형태(총계 표기 금지).
  - `manuscript.tsx`의 `draftRef`·`scrollIntoView`(인라인 패널을 화면에 보이게 하던 코드)는 모달에서 의미가 없어 **이번 변경이 만든 orphan으로 제거**한다.
- Definition of Done:
  - `AI 이어쓰기` 클릭 → 중앙 모달이 뜨고 **편집 화면을 클릭·타이핑할 수 없다**(브라우저 육안).
  - 스트리밍 중 **원문 텍스트 blob이 화면에 보이지 않고**, 후보가 하나씩 카드로 채워지며 맨 아래 스켈레톤 1개가 남는다(브라우저 육안).
  - ESC·바깥 클릭·취소로 닫으면 **네트워크 탭에서 SSE 요청이 끊긴다**(브라우저 육안).
  - `적용`을 누르면 **이어쓰기를 시작한 커서 위치에 정확히 삽입**된다(브라우저 육안 — 본문 중간에 커서를 두고 확인).
  - LLM이 `N.`/`N)` 마커를 생략한 응답에서도 깨지지 않는다(끝에 후보 1개로 폴백).
  - `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. `useAssistStream`에 스트림 중단 노출 — `assist.api.ts`의 훅이 `stop()`을 반환하도록 한다(내부 `abortRef.current?.abort()`). abort는 사용자 의도이므로 **`error`로 노출되지 않아야** 한다(기존 `catch`가 이미 `AbortError`를 걸러낸다 — `:180`, 그 동작을 테스트로 고정). `start()`의 기존 "이전 스트림 abort" 동작과 401 갱신 경로(ADR-0007)는 건드리지 않는다. — completion criterion: 테스트 — ① `stop()` 호출 후 `isStreaming`이 false가 되고 이후 청크가 `text`에 누적되지 않는다, ② `stop()`으로 인한 AbortError가 `error`에 들어가지 않는다, ③ 기존 assist.api 테스트 전부 green 유지. (depends: none)
- [ ] S2. 증분 후보 파싱 — `lib/parse-suggestions.ts`에 스트리밍용 함수를 추가한다(기존 `parseSuggestions`의 완료 시 동작·폴백은 **그대로 보존**). 부분 텍스트를 받아 "경계가 확정된 완성 후보 목록"과 "아직 자라는 후보가 있는지"를 구분해 돌려준다. 마커가 k개면 완성은 k-1개. — completion criterion: 테스트 — ① 마커 3개인 부분 텍스트 → 완성 2개 + pending true, ② 마커 0~1개인 부분 텍스트 → 완성 0개 + pending true(원문을 후보로 내보내지 않는다), ③ 스트림 종료 텍스트에 대해 기존 `parseSuggestions`와 동일한 결과, ④ 마커 없는 완료 텍스트 → 후보 1개 폴백. (depends: none — `assist.api.ts`와 다른 파일이라 S1과 병렬 가능)
- [ ] S3. 모달화 + 로딩 연출 배선 — `suggestion-picker.tsx`를 `ui/dialog.tsx` 기반 모달로 바꾼다(폭 ~560px, 후보 세로 스택, 헤더 "N개 생성됨 · 계속 생성 중…", 하단 취소). 스트리밍 중에는 S2의 완성 후보만 카드로 렌더하고 그 아래 스켈레톤 1개(`ui/skeleton.tsx`) — **`rawText`를 직접 렌더하는 분기를 삭제**한다. ESC·바깥 클릭·취소·적용 모든 닫기 경로가 S1의 `stop()`을 호출한다. `manuscript.tsx`에서 `draftRef`·`scrollIntoView` 제거. **적용은 이어쓰기를 시작한 커서 위치에 삽입되어야 한다** — 모달로 포커스가 옮겨간 뒤에도 그렇게 되도록 하되, 스냅샷을 뜨든 TipTap selection에 의존하든 방법은 실행 단계가 판단한다(관찰 가능한 결과만 고정). — completion criterion: 테스트 — ① 모달이 열린 동안 편집 영역이 상호작용 불가(backdrop/`inert`/`aria-hidden` 중 어느 방식이든 관찰 가능하게), ② 스트리밍 중 원문 텍스트가 화면에 존재하지 않는다, ③ 완성 후보 수만큼 카드 + 스켈레톤 1개, ④ ESC로 닫으면 `stop()`이 호출된다, ⑤ 본문 중간에 커서를 둔 상태로 적용하면 그 위치에 삽입된다, ⑥ 마커 없는 응답도 완료 시 후보 1개로 뜬다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 green. (depends: S1, S2)

## 검증 노트 (직전 회고 반영)
- **플랜은 관찰 가능한 목표만 못박았다.** 커서 삽입 위치 보존을 *어떻게* 할지(selection 스냅샷 vs TipTap state 의존), 편집 차단을 *어떤 속성*으로 할지는 지정하지 않는다 — 지난 작업에서 그릴링이 구체 API(`create_task(to_thread(...))`)를 지정한 탓에 구현자가 그것을 검증 면제 대상으로 취급해 목표 미달을 놓쳤다(retro `260727-000846`).
- **테스트 green을 검증 증거로 쓰지 않는다.** "하나씩 로딩되는 느낌"과 "딤·포커스 트랩이 실제로 편집을 막는지", "닫기가 실제로 SSE를 끊는지"는 jsdom으로 고정할 수 없다 → **브라우저 육안 UAT를 필수 게이트**로 둔다(네트워크 탭에서 SSE 중단 확인 포함).
- 이번 작업에는 텍스트 입력 UI가 없어 한글 IME 가드 이슈는 해당 없다. 단 `manuscript.tsx:232`의 화 제목 Enter 가드 미적용 부채는 여전히 남아 있으며 **이번 범위 밖**이다(별건 백로그 후보).
