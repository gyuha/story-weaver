# run.md — 씬 버전 기록 모달

실행일: 2026-06-25 · 슬러그: scene-version-history · task #9
규모 작아 직접 실행. eco on(직접 실행 경로 — 메인 세션 ECO 규율 적용).

## 계획대로 된 것
- **S1** `Scene.versions?: SceneVersion[]` 타입 추가, mock ch6-s1에 스냅샷 2개 시드. `works.store.ts`에 `restoreSceneVersion`(immer, 버전 paragraphs로 현재 덮어쓰기).
- **S2** `version-history-modal.tsx`: 좌측 버전 목록(현재 + 최신순 이전 버전), 우측 선택 버전 읽기 전용 본문, `현재로 보내기` 버튼. write 화면 액션칩에 "버전 기록" 진입 버튼.
- **S3** `lib/word-diff.ts` 단어 LCS diff(의존성 0). 모달 `diff 보기` 토글 → 선택 버전→현재 변경분을 추가=초록·삭제=빨강 취소선 인라인 렌더.
- typecheck·lint 통과. playwriter로 버튼→모달→버전 선택→읽기전용→diff 토글(추가/삭제 강조)→현재로 보내기(에디터 본문 교체+토스트) 전 흐름 육안 확인.

## 계획과 달랐던 것 (분기 — 낮음~중간)
- 모달: 계획은 "modal-store 재사용 가능하면"이었으나 자체 오버레이(fixed inset + 백드롭 버튼)로 구현 — stateful 모달(선택/ diff 토글)이라 자체가 더 단순·예측가능.
- 복원 시 `editor.commands.setContent` 추가 배선: 스토어만 바꾸면 이미 마운트된 tiptap이 안 바뀌므로, ManuscriptEditor의 `restoreVersion`이 store 갱신 + 에디터 본문 재설정을 함께 수행(계획에 명시 안 됐던 필수 배선).
- a11y: 백드롭 클릭 닫기를 div onClick 대신 전체 화면 버튼으로(biome useKeyWithClickEvents 준수).

## Non-goals 준수
- 실제 백엔드·자동 스냅샷·복원 시 새 스냅샷 적재·화/작품 단위·side-by-side·diff 라이브러리 모두 손대지 않음.

## eco 천장
- diff 직접 구현(// eco), 버전 mock 시드, 현재로 보내기는 현재 본문만 덮어쓰기(새 스냅샷 안 만듦).

## 코드 리뷰
- mock UI(데이터 변경 아님, auth/API/마이그레이션 무관), 저위험 → 별도 리뷰 페이즈 생략.
