# run.md — 집필 본문 선택 AI 액션 버블 메뉴

실행일: 2026-06-24 · 슬러그: editor-selection-ai-menu · task #8
규모 작아 직접 실행. eco on(직접 실행 경로 — 메인 세션 ECO 규율 적용).

## 계획대로 된 것
- **S1** `@tiptap/react/menus`의 `BubbleMenu`로 선택 시 4개 액션(다시쓰기·늘리기·줄이기·톤 변경) 버블 메뉴. 새 의존성 0(tiptap v3 기존 설치). 새 컴포넌트 `selection-ai-menu.tsx`, `manuscript.tsx`에 2줄(import + `<SelectionAiMenu editor={editor}/>`)로 배선.
- **S2** 미리보기 팝오버: 액션 클릭 시 mock 결과(expand/shorten=선택 텍스트 기반, rewrite/tone=고정 예시) + 적용/취소. 적용 시 `insertContentAt`로 선택 영역 교체.
- typecheck·lint 통과. playwriter로 선택→버블메뉴→늘리기→미리보기 팝오버→적용(본문 치환, 51→72자) 육안 확인.

## 계획과 달랐던 것 (분기 — 낮음)
- 팝오버를 `editor.view.coordsAtPos`로 선택 위치에 앵커링(계획은 "팝오버"만 명시 — 위치 구체화). 화면 우측 넘침 클램프.
- mock 변환: rewrite/tone은 임의 텍스트를 그럴듯하게 바꾸는 게 mock으로 불가해 고정 예시 문장 사용, expand/shorten만 입력 기반. 팝오버 헤더에 "(목업)" 명시로 정직성 확보.

## Non-goals 준수
- 실제 AI·톤 서브메뉴·결과 저장·다중 선택·모바일 터치 모두 손대지 않음.

## eco 천장
- `mockTransform` 고정 변환(// eco: 실제 AI 연동 시 교체).

## 코드 리뷰
- mock UI 컴포넌트 1개 추가 + 2줄 배선, 저위험 → 별도 리뷰 페이즈 생략.
