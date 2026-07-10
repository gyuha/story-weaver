<!-- forge-slug: assist-suggestion-picker -->
<!-- task: 46 -->
<!-- tdd: on -->
# AI 이어쓰기 다중 후보를 골라 쓰는 선택 인터페이스

## Goal / Non-goals
- Goal: AI 이어쓰기(continue)가 스트림으로 뱉는 `1. … 2. … 3. …` 다중 후보를 프런트에서 개별 후보로 분리해, 사용자가 **하나를 골라 적용**할 수 있는 카드형 선택 UI를 제공한다. 지금은 전체 blob이 한 덩어리로 표시되고 `적용`이 전체를 삽입해 후보를 고를 수 없다.
- Non-goals:
  - 백엔드 프롬프트·SSE 계약 변경 없음 (`assist_router.py`/`prompt_assembler.py` 무변경 — 후보는 지금처럼 자유 텍스트 스트림으로 온다).
  - style 태스크(다시쓰기/줄이기/톤 변경)가 여러 후보를 내도록 만들지 않는다 — 단일 재작성 유지(파싱 폴백으로 자연히 카드 1개로 렌더).
  - 스트리밍 도중 점진적 카드 분리 안 함 — 스트리밍 중엔 원문 blob + '생성 중…', `[DONE]` 후에 분리.
  - 후보 재생성·즐겨찾기 등 부가 기능 없음.

## Source of truth
- Glossary terms: none (새 도메인 용어 없음 — 기존 [[모델 스위칭]]/이어쓰기 범위 내)
- Related ADRs: none (되돌리기 쉬운 프런트 UI 변경 — ADR 불필요)
- Definition of Done: AI 이어쓰기 실행 시 완료된 응답이 후보별 카드로 분리되고, 각 카드의 `적용`이 그 후보만("N." 접두 제거) 커서에 삽입한 뒤 패널을 닫는다. 후보가 1개(또는 번호 미검출)면 폴백으로 단일 카드가 뜬다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## 결정 요약 (그릴링 합의)
- **범위**: continue 계열만 — AI 이어쓰기 버튼(`manuscript.tsx`) + 선택영역 "늘리기"(`selection-ai-menu.tsx`). 프런트만.
- **파싱**: 프런트 정규식 split + 폴백. `/(?:^|\n)\s*\d+[.)]\s/` 기준 후보 분리, 첫 마커 이전 프리앰블은 버림. 마커 2개 미만이면 전체 텍스트를 단일 후보로 폴백.
- **스트리밍**: 완료 후 분리. 스트리밍 중 원문 점진 표시 + '생성 중…', 적용 버튼 비활성(현행 유지). `[DONE]` 후 카드로 split.
- **UI**: 카드마다 `[적용]` 버튼, 하단 `[취소]`. 적용 = 해당 후보 삽입 후 패널 닫기.

## Work slices
- [ ] S1. `web/src/features/editor/lib/parse-suggestions.ts` 순수 함수 (`parseSuggestions(text): string[]`) — completion criterion: 단위 테스트가 (a) `1. …\n2. …\n3. …` → 3개, (b) `1) …\n2) …` 괄호형 → 2개, (c) 번호 없는 단일 텍스트 → 1개(폴백), (d) 첫 마커 앞 프리앰블 제거, (e) 각 후보에서 `N.`/`N)` 접두·공백 트림, (f) 빈/공백 입력 → `[]` 를 모두 통과 (TDD: 테스트 RED → 구현 GREEN)
- [ ] S2. `web/src/features/editor/components/suggestion-picker.tsx` 공유 컴포넌트 (props: `rawText`, `isStreaming`, `error`, `onApply(text)`, `onCancel`) — completion criterion: RTL 테스트가 (a) 스트리밍 중엔 원문 blob + '생성 중…' 표시하고 적용 버튼 없음/비활성, (b) 완료 시 후보 수만큼 카드 + 각 `[적용]` 버튼 렌더, (c) 카드의 `[적용]` 클릭 시 접두 제거된 그 후보 텍스트로 `onApply` 호출, (d) `[취소]` 클릭 시 `onCancel` 호출, (e) error 있으면 에러 메시지 표시를 통과 (depends: S1)
- [ ] S3. `manuscript.tsx` AI 이어쓰기 배선 — completion criterion: 기존 `showDraft` blob 패널을 `SuggestionPicker`로 교체하고, `onApply`가 `editor.chain().focus().insertContent(선택후보).run()` 후 패널을 닫는다. 화면 육안(playwriter) 또는 RTL로 카드 렌더·적용 동작 확인 (depends: S2)
- [ ] S4. `selection-ai-menu.tsx` 배선 — completion criterion: 미리보기 팝오버(300px)를 `SuggestionPicker`로 교체(스크롤 허용). "늘리기"(continue)는 후보 카드 여러 개, style 액션은 폴백으로 카드 1개. `onApply`가 `insertContentAt({from,to}, preview.prefix + 선택후보)`로 선택영역을 대체. typecheck/lint/test 통과 (depends: S2)
