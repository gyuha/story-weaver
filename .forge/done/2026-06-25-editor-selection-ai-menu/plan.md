<!-- forge-slug: editor-selection-ai-menu -->
<!-- task: 8 -->
<!-- tdd: off -->
# 집필 본문 선택 시 AI 액션 버블 메뉴 (다시쓰기·늘리기·줄이기·톤 변경)

## Goal / Non-goals
- Goal: 집필(write) 화면 본문에서 텍스트를 드래그 선택하면 tiptap `BubbleMenu`가 떠서 **다시쓰기·늘리기·줄이기·톤 변경** 4개 AI 액션을 제공한다. 액션을 누르면 **미리보기 팝오버**에 mock 변환 결과가 뜨고, `적용`이면 선택 영역을 그 결과로 교체, `취소`면 닫는다.
- Non-goals: 실제 AI/백엔드 연동, 톤 선택 서브메뉴(이번엔 톤 변경=고정 mock 1개), 변환 결과 저장·기록, 다중 선택, 모바일 터치 선택 대응. 모두 이번 mock UI 범위 밖.

## Source of truth
- Glossary terms: none (UI 인터랙션 — 신규 도메인 용어 없음)
- Related ADRs: none
- Definition of Done: `/works/<id>/write/<sceneId>` 본문에서 텍스트를 선택하면 버블 메뉴(4개 액션)가 뜨고 — 액션 클릭 시 mock 결과가 담긴 미리보기 팝오버 노출, `적용` → 선택 영역이 결과로 교체, `취소` → 팝오버 닫힘(원문 유지). `pnpm typecheck` + `pnpm lint` 통과, playwriter로 선택→액션→미리보기→적용 흐름 육안 확인.

## Work slices
- [ ] S1. 선택 버블 메뉴 — `@tiptap/react/menus`의 `BubbleMenu`를 `ManuscriptEditor`의 editor에 붙여(새 의존성 없음, tiptap v3), 선택이 있을 때 `다시쓰기 · 늘리기 · 줄이기 · 톤 변경` 4개 버튼을 띄운다. UI는 기존 툴바 톤과 맞춤 — 완료 기준: 본문 텍스트 선택 시 4개 액션 버블 메뉴가 보이고 `pnpm typecheck` 통과.
- [ ] S2. 미리보기 팝오버 + 적용 — 액션 클릭 시 선택 텍스트 기반 mock 결과(액션별 고정 변환: 다시쓰기=어순/표현 바꾼 변형, 늘리기=문장 덧붙임, 줄이기=축약, 톤 변경=격식체 변형)를 작은 팝오버에 표시 + `적용`/`취소`. 적용 시 editor로 선택 영역 교체, 취소 시 닫기. mock 결과·상태는 ephemeral — 완료 기준: playwriter로 선택→액션→미리보기 팝오버→`적용`이 본문 치환·`취소`가 원문 유지 확인, `pnpm lint` 통과. (depends: S1)

## 비고 (eco)
- 변환은 순수 mock — 액션별 고정 변환 함수(// eco: mock 변환, 실제 AI 연동 시 교체). 새 의존성 0. 컴포넌트는 `editor` 피처 안(`manuscript.tsx` 또는 형제 파일)에 최소 diff로.
