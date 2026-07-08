<!-- forge-slug: m3-web-editor-wiring -->
<!-- task: 37 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M3 — 웹: 에디터 AI 버튼 실 API 연동

`m3-writing-assist-backend`(task 36)로 에디터의 AI 기능을 전환.

## 목표 / 비목표

- 목표: `selection-ai-menu.tsx`(다시쓰기/늘리기/줄이기/톤변경)와 이어쓰기 인라인 제안이 `mockTransform()`/`MOCK_DRAFT` 대신 실 API(SSE 스트리밍) 호출. 스트리밍 토큰이 점진적으로 UI에 렌더.
- 비목표: 인필링 UI가 아직 없다면 이 작업에서 새로 만들지 않음(기존 UI 표면에 있는 기능만 실 연동 — 없는 기능을 이번에 추가하지 않는다). 동적 업데이트 제안 UI(`updateSuggestion`, task 38에서 다룸).

## 진실의 출처

- Glossary terms: 없음.
- 코드 사실: `selection-ai-menu.tsx:18`의 `mockTransform()`, `manuscript.tsx:38`의 `MOCK_DRAFT`(탐색 확인).
- Definition of Done: 본문을 선택해 "다시쓰기" 등을 누르면 실 API 결과가 스트리밍으로 표시된다. `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. API 파사드 + SSE 클라이언트 (TDD) — completion criterion: `task contract` 재생성 후 집필 보조 facade 추가. SSE 스트리밍을 웹에서 소비하는 방식 결정(fetch+ReadableStream 또는 EventSource — 기존 인증 헤더 필요 시 EventSource 제약 고려해 fetch 스트림 선택 권장) + 공용 훅.
- [ ] S2. selection-ai-menu 배선 (TDD) — completion criterion: `mockTransform` 제거, 각 액션이 실 API 스트리밍 결과로 교체. RTL(스트리밍은 mock fetch로 테스트).
- [ ] S3. 이어쓰기 인라인 제안 배선 (TDD) — completion criterion: `MOCK_DRAFT` 제거, 실 이어쓰기 API 결과로 `aiSuggestion` 채움. RTL.
- [ ] S4. 검증 — completion criterion: `task web:check`/`pnpm test` 통과, playwriter로 선택→다시쓰기 실 스트리밍 UAT. (depends: S1-S3)
