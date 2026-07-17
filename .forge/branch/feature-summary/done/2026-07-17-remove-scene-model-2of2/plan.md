<!-- forge-slug: remove-scene-model-2of2 -->
<!-- task: 57 -->
<!-- tdd: on -->
<!-- part: 2/2 -->
<!-- priority: high -->
# web을 화(Chapter) 단위로 리팩터링 — Scene 잔재 제거

## Goal / Non-goals
- Goal: part 1/2가 재정의한 계약에 맞춰 web(web/src)을 화 단위로 리팩터링한다. `pnpm generate` 재생성 후 Scene 타입·스토어 액션·셀렉터·하이드레이션·라우트(`$sceneId`→`$chapterId`)·컴포넌트를 화 기준으로 바꾸고, 씬 잔재 UI를 제거하며, 버전 기록을 화 단위로 이관한다. web 테스트 green.
- Non-goals:
  - 백엔드 변경 — part 1/2가 랜딩(계약 재수출)돼 있어야 한다(소프트 선행).
  - 새 UI 디자인 — 화면 형태는 유지하고 단위만 화로 바꾼다(리스타일 아님).
  - 화 요약 기능(원래 요청) — 별도 과제.

## Source of truth
- Glossary terms: 화(=챕터/Chapter)·부(Part)·메모리·버전 기록 — .forge/CONTEXT.md
- Related ADRs:
  - .forge/branch/feature-summary/adr/260716-17a-remove-scene-collapse-into-chapter.md (이 결정)
  - .forge/adr/0006-code-first-openapi-contract-pipeline.md (pnpm generate 재생성)
  - .forge/adr/0007-frontend-session-token-handling.md (assist SSE의 수동 fetch·401 처리 유지)
- Definition of Done: web에서 `Scene` 타입·`$sceneId` 라우트·`scene_id` 호출이 사라지고, 편집·메모리(설정 참고)·집필 보조(이어쓰기·선택영역 AI)·버전 기록·타임라인 시점이 모두 화 단위로 동작한다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과, playwriter로 편집→저장→메모리 추천→AI 이어쓰기 흐름을 육안 확인.

## Work slices (TDD: 각 슬라이스는 실패하는 테스트를 먼저 작성 — 재생성/기계적 슬라이스는 예외)
- [ ] S1. 계약 재생성 — `pnpm generate`로 `src/api` 재생성(생성물, 직접 편집 금지). — 완료 기준: 재생성 결과에서 scene 심볼이 사라지고 화 `body`·chapter-scoped 경로 타입이 반영됨을 확인(이 시점의 `pnpm typecheck` 실패는 아직 안 고친 소비처 때문으로 예상).
- [ ] S2. 타입·스토어·셀렉터 화 단위화 — `types.ts`의 Scene 필드(body/status/linkedEntityIds/vectorMemory/pendingSuggestions/aiSuggestion/versions)를 `Chapter`로 이관, `SceneVersion`→`ChapterVersion`. 스토어 씬 액션 6종을 `chapterId` 기준으로 재서명(`findScene`→`findChapter`), `createChapterAndScene`의 씬 부수 생성 제거. `selectors`의 `flattenScenes`/`findSceneLocation`/`defaultSceneId`→화 버전. — 완료 기준: 스토어·셀렉터 단위 테스트가 chapter 기준으로 통과. (depends: S1)
- [ ] S3. 라우트·네비게이션 — `write/$sceneId`→`write/$chapterId`, `write/index` 리다이렉트를 화 기준으로, `work-tree`의 화 클릭에서 `scenes[0]` 우회 제거, read→편집 복귀 Link를 화 기준으로. `routeTree.gen.ts` 재생성. — 완료 기준: work-tree·라우트 테스트와 딥링크/하이드레이션 경합 테스트가 chapter 기준으로 green. (depends: S2)
- [ ] S4. API facade·하이드레이션 — `assist.api.ts`의 수동 URL을 `/works/{workId}/chapters/{chapterId}/assist/...`로(SSE·401 처리 유지), `manuscript`/`memory`/`suggestion`/`world-bible` facade를 chapter 스코프로, `hydrate-chapters`가 씬별 개별 fetch 루프 없이 화 본문·엔티티 링크를 조립. — 완료 기준: assist.api·hydrate-chapters 테스트가 chapter 스코프로 통과. (depends: S1)
- [ ] S5. 컴포넌트·씬 잔재 제거 + 육안 확인 — manuscript/editor-screen을 화 본문 기준으로, memory-panel에서 "씬 N" 인덱스 표기 제거, `version-history-modal`을 화 버전 기록으로 이관, selection-ai-menu를 화 기준으로, reading-screen의 다중 씬 concat 제거(화 본문 단일 렌더), timeline-screen의 "N화 씬M"→"N화"·`reviewSummary` 화 카운트 라벨, relationship-graph-screen 시점 드롭다운을 화 단위로. — 완료 기준: 컴포넌트 테스트 green, `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과, playwriter로 편집→저장→메모리 추천→AI 이어쓰기 동작 확인. (depends: S2, S3, S4)
