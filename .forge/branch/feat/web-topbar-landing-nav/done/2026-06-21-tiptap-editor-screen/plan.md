<!-- forge-slug: tiptap-editor-screen -->
<!-- task: 4 -->
<!-- tdd: off -->
# 편집 모드 화면을 tiptap 리치텍스트 에디터로 재구성 (제공 이미지 기준)

## Goal / Non-goals
- Goal: `write/$sceneId` 편집 화면을 제공 이미지의 레이아웃으로 재구성한다 — 큰 제목 + 액션 칩(저장/요약/장면 이미지/다시쓰기) + 품질 티어 셀렉터 + AI 초안 생성 버튼 + 서식 툴바 + tiptap 본문 에디터 + 하단 상태바. 본문은 StarterKit 기반 tiptap 에디터로 실제 편집 가능하게 만든다. WorkShell(작업트리)·메모리 패널은 유지.
- Non-goals:
  - 정렬(좌/중/우)·표 툴바 — 추가 패키지 필요 + 소설 원고에 불필요해 이번엔 제외.
  - 인라인 AI 고스트(Tab 수락/Esc, `scene.aiSuggestion` 렌더) — 새 디자인에 없고 ephemeral 편집과 충돌하므로 제거.
  - 실 API 연결·본문 영속 저장 — 편집은 ephemeral(에디터 로컬 상태), 실 API 전환은 추후.
  - 모델 직접 선택 UI — ADR-0004 유지(모델명·BYOK 비노출), 품질 티어로 대체.
  - 전체화면 API·라이브 시계·진행률 실계산 — 상태바에서 정적 목업.
  - `@tiptap/extension-link` 별도 설치 — v3 StarterKit에 이미 포함되어 중복.

## Source of truth
- Glossary terms: [[편집 모드]], [[읽기 모드]], [[품질 티어]] in .forge/CONTEXT.md (모두 기존 정의 유지 — 메모리 패널 존속으로 편집 모드 정의 변경 없음).
- Related ADRs: .forge/adr/0004-user-llm-setting-as-quality-tier.md — 이미지의 "Claude Sonnet 4.5" 모델 셀렉터는 이 결정과 충돌하므로 **품질 티어(저비용/균형/고품질) 셀렉터로 대체**(재확인, 새 ADR 없음).
- Definition of Done: `/works/$workId/write/$sceneId` 화면이 [작업트리 | 새 에디터 컬럼 | 메모리 패널] 3단 구성으로 렌더되고, 본문이 편집 가능한 tiptap 에디터이며, 툴바/헤더/상태바가 합의대로 동작한다. `pnpm typecheck` · `pnpm lint` · `pnpm build` green + playwriter UAT 통과.

## Work slices
- [ ] S1. tiptap 설치 — `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit` (최신 v3). — completion criterion: 세 패키지가 `web/package.json`에 등재되고 `pnpm typecheck` green. (extension-link은 설치하지 않음)
- [ ] S2. tiptap 에디터 본문 — `useEditor`(StarterKit) + `EditorContent`. 초기 content는 `scene.paragraphs`를 `<p>`로 직렬화해 주입(대사 문단 스타일 유지), 편집은 로컬 상태(스토어 미반영). 기존 `manuscript.tsx`의 정적 렌더·하단 독·고스트 로직 제거하고 이 에디터 본문으로 대체. — completion criterion: write 화면에서 본문이 캐럿이 잡히는 편집 가능한 에디터로 렌더되고 타이핑이 반영됨(playwriter). (depends: S1)
- [ ] S3. 서식 툴바 — 되돌림/다시쓰기, B/I/U/S, H2(heading 토글), 글머리표/번호 목록, 링크. 모두 StarterKit 커맨드(`editor.chain()...`)에 연결, 활성 상태 표시. — completion criterion: 선택 텍스트에 굵게·기울임 등 토글이 실제 적용됨(playwriter 일부 버튼 확인). (depends: S2)
- [ ] S4. 상단 헤더 — 큰 제목(`{chapter.index}화 {scene.title 또는 chapter.title}`), 액션 칩 4개(저장/요약/장면 이미지/다시쓰기 → toast 목업), 품질 티어 셀렉터(저비용/균형/고품질 — 모델명 없음), AI 초안 생성(파란 주 버튼 → 클릭 시 에디터에 mock 본문 단락 삽입). — completion criterion: 칩 클릭→toast, 티어 셀렉터에 모델명·API키 부재, AI 초안 생성→에디터에 텍스트 삽입(playwriter). (depends: S2)
- [ ] S5. 하단 상태바 — 글자수·예상 읽기시간은 `editor.getText()`에서 실계산(추가 패키지 없이), 진행률 바·"자동 저장 완료"·시각은 정적 목업, "집필 모드 ⌄"는 읽기 모드(`/works/$workId/read/$chapterId`)로 이동하는 링크/드롭다운. — completion criterion: 타이핑 시 글자수 갱신, 집필 모드 → 읽기 화면 이동(playwriter). (depends: S2)
- [ ] S6. editor-screen 재배선 + 검증 — `editor-screen.tsx`를 WorkShell + 새 에디터 컬럼(S2~S5) + MemoryPanel 3단으로 재구성, 기존 46px 상단바 제거. 새 디자인에서 끊긴 import/코드 정리. — completion criterion: 3단 레이아웃 렌더 + 메모리 패널 존속, `pnpm typecheck`·`pnpm lint`·`pnpm build` green, playwriter 종합 UAT 통과. (depends: S3, S4, S5)
