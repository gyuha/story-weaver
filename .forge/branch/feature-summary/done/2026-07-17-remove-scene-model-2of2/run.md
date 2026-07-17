# RUN — web을 화(Chapter) 단위로 리팩터 (task #57, part 2/2)

- slug: remove-scene-model-2of2
- executed: 2026-07-16
- 실행 방식: fg-run Dynamic Workflow (coarse 4슬라이스 + 최종 홀리스틱 게이트 + 적대적 검토 3렌즈), eco 상한(subagent=sonnet)
- 워크플로우 run ID: wf_7d31a1f4-86a (subagent 7, 토큰 ~0.94M, 54분)
- 설계 메모: #56 교훈(밀결합 타입그래프의 per-slice typecheck 게이트는 중간 halt)을 반영해, 계획의 5슬라이스를 **의존성 웨이브로 번들**(W1 재생성 → W2 데이터계층[S2+S4] → W3 뷰계층[S3+S5] → W4 최종 홀리스틱 게이트). 슬라이스 드롭 없음.

## 계획대로 된 것 (divergence: 낮음~중간)

- **W1~W4 전 슬라이스 done, halt 없음.** #56과 달리 워크플로우가 중단 없이 완주 — coarse+홀리스틱 게이트 재설계가 유효했다.
- **DoD 자동 게이트 전부 green (독립 검증됨):**
  - `pnpm typecheck` (tsc --noEmit, src 전체·테스트 포함, src/api 제외) — EXIT 0, 에러 없음.
  - `pnpm lint` (biome) — EXIT 0, 211파일 clean.
  - `pnpm test` (vitest run) — EXIT 0, 44파일 210테스트 통과(변경된 모든 화면 컴포넌트 RTL 테스트 포함).
  - `pnpm build` (tsc -b && vite build) — EXIT 0(청크 크기 경고만, 비치명적).
  - 기능적 Scene 잔재 grep(생성물·주석 제외) — 0건: `Scene` 타입·`SceneVersion`·`$sceneId` 라우트·`scene_id` 호출·`findScene`·`flattenScenes` 모두 소멸.
- **계약 재생성**: `pnpm generate`로 src/api 재생성(백엔드 part 1/2의 chapter-scoped openapi.json 소스). SceneResponse/scene_id 0건, ChapterResponse.body 반영.
- **라우트**: `write/$sceneId.tsx`→`write/$chapterId.tsx` 리네임, routeTree.gen.ts가 `$chapterId`로 재생성됨.
- **assist SSE/401 유지(ADR-0007)**: 적대적 검토가 `assist.api.ts`의 SSE 파싱([DONE]·event:error)·401 단일비행 refresh+재시도+/auth/login 리다이렉트 로직이 rename 전과 동일(식별자 치환뿐)임을 라인 대조로 확인.

## 계획과 어긋난 것 / 주의점

1. **하네스 LSP 진단이 워크플로우 완료 시점에 stale였다 — 조사로 해소.**
   완료 알림에 딸려온 LSP 진단이 `works.store.ts`(createChapterLink 부재), `editor-screen.tsx`(MemoryPanel scene prop), 라우트 파일(routeTree 불일치), `memory-panel.test.tsx`(`Cannot find name 'SCENE'`) 등 다수 TS 에러를 보고. 워크플로우 자기보고("typecheck clean")와 정면 충돌해 신뢰하지 않고 직접 게이트를 재실행 → **실제 트리는 clean**(typecheck/lint/test/build 전부 EXIT 0). LSP가 워크플로우 중간 상태(routeTree.gen.ts 재생성·최종 리네임 정착 전)를 반영한 stale였던 것으로 판정. 교훈: 방금 끝난 백그라운드 워크플로우 직후의 LSP 진단은 stale일 수 있으니, 게이트 재실행으로 확정할 것.

2. **계획 텍스트를 넘어선 리네임(스코프 판단, 전부 문서화됨).**
   - `types.ts`: `Scene` 인터페이스 완전 삭제(1:1 collapse라 잔존 이유 없음), `SceneStatus`→`ChapterStatus`.
   - `selectors.ts`: `flattenScenes`/`SceneLocation` 삭제(Chapter가 이미 flat), `findSceneLocation`→`findChapter`, `defaultSceneId`→`defaultChapterId`.
   - `world-bible.api.ts`: `sceneLinks/createSceneLink/deleteSceneLink`→`chapterLinks/createChapterLink/deleteChapterLink`.
   - `works.store.ts`: 씬 액션을 chapterId 기준 재서명 + 함수명까지 `extractSceneUpdates→extractChapterUpdates` 등 리네임.
   - `manuscript.api.ts`: scenes CRUD 메서드 전량 제거(백엔드가 scene 엔드포인트 폐지, Chapter.body로 본문 획득).
   - `types.ts`: `ConflictSceneRef`→`ConflictChapterRef`(생성 타입이 이미 chapterId라 강제됨).
   모두 "화 흡수" 목적에 부합하고 최종 게이트로 검증됨.

3. **playwriter 육안 확인(계획 DoD)은 미수행 — 정직히 기록.**
   계획 DoD는 "playwriter로 편집→저장→메모리 추천→AI 이어쓰기 흐름 육안 확인"을 요구하나, (a) `mcp__playwriter_latest__execute` MCP가 이 세션에 미연결이고, (b) 현재 :3000 dev 서버는 **다른 체크아웃**(`/Users/gyuha/workspace/story-weaver/web`)을 서빙 중이라 이 브랜치 트리가 아님. 따라서 실 브라우저 end-to-end 육안 확인은 수행하지 못했다. 대신 **210개 RTL 컴포넌트 테스트**가 변경된 전 화면(manuscript·memory-panel·timeline-screen·work-tree·selection-ai-menu·relationship-graph 등)을 mock 데이터로 렌더·검증한다. → **권장 후속**: `feature-summary/web`에서 dev 서버를 별도 포트로 띄워 육안 확인하거나, playwriter MCP 연결 후 확인.

4. **의도적으로 남긴 것**: `ReviewSummary.scenes` 필드(백엔드 계약 유래, 생성물 `src/api`에 존재 — 백엔드 스키마+openapi 재수출이 선행돼야 web에서 정리 가능, part 1/2에서도 minor로 남긴 `WorkSummary.scenes`와 동일 항목). `scene-links.test.ts` 파일명(내용은 chapter). 폐지 이력 설명 주석.

## 검증 (UAT)

- `verified: yes` — 근거: `pnpm typecheck`·`lint`·`test`(210)·`build` 전부 EXIT 0(독립 재실행) + 기능적 scene 잔재 0 + routeTree $chapterId 재생성 + assist SSE/401 라인대조 회귀 없음.
- **단서**: 계획 DoD의 playwriter 육안 확인은 미수행(위 3번 — 도구 미연결·:3000이 타 체크아웃). 자동 게이트+RTL 테스트로 대체 검증했으며, 실 브라우저 육안 확인은 후속 권장 사항으로 남긴다.
