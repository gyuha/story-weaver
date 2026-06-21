<!-- forge-slug: reading-mode -->
<!-- task: 3 -->
<!-- tdd: off -->
# 읽기 모드(챕터 단위 몰입 읽기) 추가

## Goal / Non-goals
- Goal: web에 작가용 **읽기 모드**를 추가한다. 기존 집필(편집) 화면과 **별개**의 전용 라우트로, 한 챕터(=화)의 모든 씬을 끊김 없이 연속으로 보여주는 read-only 몰입 뷰. 작업 크롬(작업트리·메모리 패널·AI 도구·전역 TopBar)을 모두 걷어낸다. 현재 web 단계와 동일하게 `works.store` mock 데이터로 동작.
- Non-goals:
  - 읽기 환경 커스터마이즈(폰트 크기·읽기 테마·다크모드 토글) — 후속.
  - 진행률/마지막 읽은 위치 기억 — 후속.
  - 외부 독자 대상 퍼블리싱·연재·공유 — 별개 제품 영역(랜딩의 독자용 "읽기"와 무관).
  - 모바일 반응형 정교화 — 데스크톱 우선, 깨지지 않는 수준만.
  - 백엔드 연동(실제 원고 fetch/저장) — 후속.
  - 편집 모드 자체의 변경 — 토글 버튼 추가 외에는 손대지 않음.

## Source of truth
- Glossary terms: [[읽기 모드]], [[편집 모드]] (`.forge/CONTEXT.md` — 이번 그릴링에서 추가)
- 데이터/셀렉터: `web/src/features/shared/types.ts`(`Chapter.id`/`Scene.paragraphs`/`SceneStatus`), `web/src/features/shared/store/selectors.ts`(`useWork`/`flattenScenes`/`findSceneLocation`; 챕터 조회 셀렉터는 신규 추가), `web/src/features/shared/store/works.store.ts`(mock)
- 참고 타이포/렌더: `web/src/features/editor/components/manuscript.tsx`(serif `text-[16.5px] leading-[1.95]`, 대사 「」 스타일, 빈 씬 처리)
- 라우팅 규약: 파일 기반(`web/src/routes/`, `routeTree.gen.ts` 자동 생성·수정 금지), `requireAuth` 가드 패턴(기존 write 라우트와 동일)
- Definition of Done: 집필 화면 상단바의 "읽기" 버튼 → 현재 씬이 속한 챕터의 읽기 모드(`/works/$workId/read/$chapterId`)가 열리고, 해당 챕터의 비어있지 않은 모든 씬이 씬 경계 없이 연속 렌더되며, 이전 화/다음 화 이동과 "편집" 복귀(그 챕터 첫 씬의 집필 화면으로)가 동작한다. 작업트리·메모리·AI·전역 TopBar가 보이지 않는다. `pnpm typecheck`·`pnpm lint`·`pnpm build` green.

## Work slices
- [ ] S1. 읽기 라우트 골격 + 챕터 셀렉터 — completion criterion: `routes/works/$workId/read/$chapterId.tsx`와 `read/index.tsx`(기본 챕터로 redirect)가 추가되고, `selectors.ts`에 `findChapter(work, chapterId)`(+ 이전/다음 챕터 도출)가 생긴다. 잘못된 `chapterId`는 기본 챕터 또는 `/works/$workId/write`로 폴백. `requireAuth` 가드 적용. `routeTree.gen.ts`가 자동 갱신되고 `to`/`params` 타입이 컴파일된다.
- [ ] S2. 몰입형 읽기 레이아웃 + 본문 렌더 — completion criterion: WorkShell을 쓰지 않는 전용 풀스크린 레이아웃 컴포넌트(`features/editor/components/reading-screen.tsx` 등)가, 상단 얇은 읽기 바(`N화 · 제목` + 이전 화/다음 화 + "편집" 복귀 버튼)와 가운데 정렬 serif 본문 칼럼을 렌더한다. 챕터의 씬들을 **씬 경계 없이**(작은 여백만) 연속 렌더하고, `status: 'empty'`이거나 문단 0개인 씬은 건너뛴다. 대사(「」) 스타일 유지. 모든 씬이 비면 "아직 작성된 내용이 없습니다" 안내. 작업트리·메모리·AI 도구·고스트·전역 TopBar 미표시.
- [ ] S3. 진입·복귀 토글 + 챕터 경계 내비 — completion criterion: 집필 화면(`editor-screen.tsx`) 상단바에 "읽기" 버튼이 추가되어 현재 씬이 속한 챕터의 읽기 모드로 이동한다. 읽기 모드의 "편집" 버튼은 그 챕터의 **첫 씬**의 집필 화면(`/works/$workId/write/$sceneId`)으로 복귀한다. 이전 화/다음 화 이동이 동작하고(상단 바 + 챕터 하단), 마지막 화에서는 "다음 화" 대신 "마지막 화입니다"를 표시한다. (depends: S1, S2)
