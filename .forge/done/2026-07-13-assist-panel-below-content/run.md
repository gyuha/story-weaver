<!-- forge-slug: assist-panel-below-content -->
# run — AI 이어쓰기 패널을 본문 아래로 (2026-07-13)

직접 실행(단일 슬라이스, eco 모드 — Workflow 생략, ECO.md 라지니스-퍼스트 규율 적용). TDD on.

## 계획대로 된 것

- S1 — `manuscript.tsx`의 `showDraft && SuggestionPicker` 블록을 "AI 이어쓰기" 버튼 바로 아래에서 본문 에디터(`EditorContent` + `SelectionAiMenu`) 컨테이너 **아래**로 이동. 적용(`insertContent` — 커서 위치)/취소/스트리밍 로직, AI 이어쓰기 버튼 위치·모양은 그대로 유지.
- 패널 등장(`showDraft` false→true) 시 ref 기반 `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`을 1회 호출하는 `useEffect` 추가.
- TDD 선작성: ① DOM 순서 테스트 — 패널(취소 버튼)이 에디터 컨테이너 뒤에 렌더되는지 `compareDocumentPosition`으로 확인 ② `scrollIntoView` 호출 테스트 — jsdom에는 없어 `Element.prototype.scrollIntoView`에 `vi.fn()` 주입. 변경 전 컴포넌트에 대해 두 테스트가 **레드**임을 확인(관련 4건 실패: DOM 순서 테스트 자체 에러 + 그 파급 3건, `scrollIntoView` 미호출 1건) → 구현 적용 후 **그린** 전환 확인.
- 기존 이어쓰기 테스트(스트리밍 반영·적용·씬 맨 앞 폴백·빈 씬 안내·스트림 에러 등 8건) 전부 회귀 없이 통과.
- S2 — `pnpm typecheck` · `pnpm lint` · `pnpm test` 전체 통과(39 files, 180 tests green). playwriter MCP로 육안 확인을 시도했으나 "Extension not connected"로 실패(연결할 사용자 상호작용이 없는 세션) — 수동 확인 절차를 안내(아래).

## 차이(divergences)

1. 패널을 본문 에디터 컨테이너 **안**이 아니라 그 **뒤의 형제 요소**로 배치 — 계획이 허용한 두 옵션(컨테이너 아래 / 컨테이너 안 EditorContent 뒤) 중 레이아웃상 더 자연스러운 쪽을 선택.
2. 패널 래퍼의 여백 클래스를 `mt-2` → `mt-4`로 변경 — 버튼 바로 아래가 아니라 서식 툴바·본문 블록 아래로 옮기며 기존 값이 좁아 보여 조정(계획에 명시되지 않은 사소한 스타일 선택).
3. DOM 순서 테스트를 타입 안전하게(널 가능성 없이) 작성하기 위해 프로덕션 코드에 `data-testid="editor-container"`를 추가 — 테스트 인프라 목적의 최소 계측이며 기능 변경 아님.
4. playwriter 육안 확인 불가 — 브라우저 확장 미연결(백그라운드 세션이라 확장 아이콘을 클릭해줄 사용자가 없음). 아래 수동 확인 절차로 대체.

## 수동 확인 절차 (playwriter 대체)

1. `pnpm dev`(이미 `:3000`에 기동 중) 상태에서 브라우저로 임의 작품 → 화 → 씬 편집(집필) 화면 진입.
2. 본문에 한두 문장을 입력한 뒤 "AI 이어쓰기" 버튼 클릭.
3. 패널이 서식 툴바·본문(`EditorContent`) **아래**에 나타나는지, 화면이 그 위치로 부드럽게 스크롤되는지 확인.
4. 스트리밍 완료 후 "적용" 클릭 시 커서 위치에 텍스트가 삽입되는지, "취소" 클릭 시 패널이 닫히는지 확인.

## 후속 후보

- 없음(범위가 작고 명확해 후속 후보 없음).
