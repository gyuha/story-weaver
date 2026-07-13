<!-- forge-slug: assist-panel-below-content -->
<!-- task: 50 -->
<!-- retro-hint: optional -->
<!-- tdd: on -->
# AI 이어쓰기 패널을 본문 아래로 — 이어서 쓰는 흐름으로 배치

## Goal / Non-goals

- Goal: AI 이어쓰기 패널(SuggestionPicker — 생성 중 표시·후보 카드)이 버튼 바로 아래가 아니라 **본문 에디터(EditorContent) 바로 아래**에 나타나, 글 내용에 이어서 쓰는 흐름으로 보이게 한다. 본문이 길어도 패널 등장 시 자동 스크롤로 바로 보인다.
- Non-goals:
  - 후보 '적용' 시 삽입 위치 변경 — 기존 커서 위치 삽입 유지 (그릴링 확정: 이어쓰기의 커서 의미론과 일관)
  - AI 이어쓰기 버튼 자체의 위치·모양 변경
  - SelectionAiMenu(드래그 선택 AI 메뉴)·SuggestionPicker 내부 UI 변경

## Source of truth

- Glossary terms: 편집 모드 (Edit Mode), 씬 (Scene) — `.forge/CONTEXT.md`
- Related ADRs: none
- 현재 구조(사전 조사): `web/src/features/editor/components/manuscript.tsx` — AI 이어쓰기 버튼(245-253행) 바로 아래에 `showDraft && SuggestionPicker` 블록(255-268행), 서식 툴바(271행~), 본문 `EditorContent`(339행) + `SelectionAiMenu`(340행) 순. 패널 블록을 EditorContent 아래로 이동한다.
- 결정(그릴링): 패널 등장 시 `scrollIntoView({ behavior: 'smooth' })` 1회로 화면에 들어오게(긴 본문에서 반응 없음으로 오인 방지). jsdom에는 scrollIntoView가 없으므로 테스트에서 mock.
- Definition of Done: 이어쓰기 실행 시 패널이 본문 아래에 나타나고 화면에 스크롤되어 보인다. 기존 이어쓰기 동작(스트리밍·후보 적용·취소) 불변. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices

- [ ] S1. `manuscript.tsx`의 `showDraft` 패널 블록을 `EditorContent` 아래로 이동 + 패널 등장(showDraft true 전환) 시 ref 기반 `scrollIntoView(smooth)` 1회. 적용/취소/스트리밍 로직 불변. — 완료 기준: (TDD 선작성) ① DOM 순서 테스트 — 패널이 에디터 컨테이너 뒤에 렌더됨 ② 패널 등장 시 scrollIntoView 호출 테스트(jsdom mock) 통과 + 기존 manuscript 이어쓰기 테스트 회귀 없음
- [ ] S2. 검증: `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과 + 화면 확인(playwriter 가능 시 이어쓰기 실행 화면 육안 확인, 불가 시 수동 확인 절차 안내). — 완료 기준: DoD 충족 (depends: S1)
