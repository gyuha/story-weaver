# run — 편집 모드 화면을 tiptap 리치텍스트 에디터로 재구성

실행: 2026-06-21 / 방식: 워크플로우 없이 단일 에이전트 직접 순차 실행(슬라이스가 동일 파일 2개에 강하게 의존 — 병렬 분할 시 충돌만 발생, fg-run "소규모는 직접 처리" 제약 적용).

## 계획대로 된 것
- S1. tiptap 설치 — `@tiptap/react @tiptap/pm @tiptap/starter-kit` **v3.27.1**(최신 v3). `@tiptap/extension-link`는 계획대로 미설치(v3 StarterKit에 Link 포함).
- S2. tiptap 에디터 본문 — `useEditor(StarterKit)` + `EditorContent`. 초기 content는 `scene.paragraphs`를 `<p>`로 직렬화(HTML escape 포함). 편집 ephemeral(스토어 미반영). 씬 전환 시 `key={scene.id}`로 리마운트해 본문 재초기화.
- S3. 서식 툴바 — 되돌림/다시·B/I/U/S·H2·글머리/번호 목록·링크. `useEditorState` selector로 활성 상태·can(undo/redo) 구독. UAT: 단어 선택→굵게 클릭 시 `<strong>` 실제 적용 확인.
- S4. 헤더 — 큰 제목(`{index}화 {title}`), 액션 칩 4개(toast), **품질 티어 셀렉터(저비용/균형/고품질 — 모델명 없음, ADR-0004 준수)**, AI 초안 생성(파란 버튼 → 에디터에 mock 단락 삽입). UAT: 빈 씬에서 클릭 시 본문 삽입 + 글자수 0→73 확인.
- S5. 하단 상태바 — 글자수·예상 읽기 `editor.getText()` 실계산, 진행률·자동저장·시각 정적, 집필 모드 → `/works/$workId/read/$chapterId` 링크. UAT: 집필 모드 href=/works/hoegwija/read/ch7 확인.
- S6. editor-screen 재배선 — WorkShell + ManuscriptEditor + MemoryPanel 3단. 기존 46px 상단바·하단 도구 독·인라인 고스트 제거. UAT: worktree=1·memory=1·editor=1 렌더 확인.

## 계획과의 차이 / 현장 결정
- 컴포넌트명: `Manuscript` → **`ManuscriptEditor`**로 rename(헤더·툴바·상태바까지 포함하게 되어 의미 명확화). editor-screen import 1줄 수정.
- 에디터 본문 자식 요소(p/h2/ul/a/strong) 스타일은 typography 플러그인이 없어 `globals.css`에 `.sw-editor` 스코프 CSS **소량 추가**(계획에 명시 안 했으나 contenteditable 렌더에 필수).
- 글자수는 공백 제외(`replace(/\s/g,'')`) 기준 — 이미지 423 같은 "글자 수" 의미에 부합.
- 시각("오후 2:34")·진행률("8%")은 계획대로 정적 하드코딩(라이브 시계·진행률 실계산은 비목표).
- 전체화면 아이콘은 비목표(전체화면 API)라 toast 목업 처리.

## 잔여/주의
- `works.store.ts`의 `acceptInlineSuggestion` 액션이 고스트 제거로 **호출처 없는 dead code**가 됨(스토어 API라 lint 미경고). 사전 존재 코드라 이번엔 삭제하지 않음 — 추후 정리 대상.
- `scene.aiSuggestion` 타입·mock 필드는 잔존(렌더 안 함). 실 API 단계에서 인라인 고스트 재도입 시 활용 가능.
- 편집 ephemeral이라 실 API 전환 시 `onUpdate`를 뮤테이션에 연결해야 함(비목표).

## 후속 추가 (사용자 요청, 동일 루프 내)
- 챕터 제목 편집 가능화 — 정적 `<h1>` → "{index}화"(고정 접두) + 제목 `<input>`. hover/focus 시 옅은 배경으로 편집 가능 신호.
- **제목 편집의 작업트리 반영** — 본문(ephemeral)과 달리 제목은 store에 영속. `works.store.ts`에 `renameChapter(workId, chapterId, title)` 액션 추가, input을 `chapter.title`(store) 바인딩 + onChange→`renameChapter`. `useWork`가 store 구독이라 좌측 WorkTree도 동시 갱신. UAT: 제목 "혈산문의 그림자"→"낯선 문" 변경 시 작업트리 노드도 갱신·옛 제목 DOM 완전 소거 확인. tsc/lint/build green.

## 검증
- `pnpm typecheck` green · `pnpm lint` green(115 files) · `pnpm build` green(_sceneId 청크 424kB — tiptap 포함, 청크 크기 경고만, 기존 수준).
- playwriter UAT(`/works/hoegwija/write/ch7-s1`, `ch7-s3`): 3단 레이아웃·본문 로드·티어 모델명 부재·AI 삽입·글자수 실계산·툴바 굵게 적용·집필 모드 링크 모두 통과.
