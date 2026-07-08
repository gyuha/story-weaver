# RUN — M1: 웹 — 계층(부·챕터·씬) 실 API 연동

slug: m1-web-hierarchy-wiring · task: 32 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입, `web-feature-builder` 위임): Facade(S1) → Hydrate(S2, S1 의존) → Wire 병렬(S3 화·부 CRUD·S4 씬 본문 저장, 둘 다 S2 의존).

## 계획대로 된 것

- **S1**: `web/src/features/editor/api/manuscript.api.ts` — 시놉시스/부/화/씬 facade + Query/Mutation 훅(works.api.ts 패턴 그대로).
- **S2**: 매핑 결정 — 백엔드 Episode를 별도 엔티티로 승격하지 않고 기존 mock의 `Chapter{partLabel, index, scenes}` 평탄화 구조를 그대로 유지(`partLabel = episode.title`). `manuscript.tsx`/`timeline-screen.tsx`/`selectors.ts` 무변경으로 끝남. `setWorkChapters` 액션 추가, 작품 로드 시 실 하이드레이션(로딩/에러 포함).
- **S3**: 화·부 CRUD 6개 액션(`addChapter`/`addPart`/`renameChapter`/`renamePart`/`deleteChapter`/`deletePart`)을 동기 mock에서 실 API 호출 `async` 함수로 전환. `deletePart`는 DB cascade에 위임(클라이언트가 개별 챕터/씬을 지우지 않음).
- **S4**: `manuscript.tsx`의 "저장(목업)" 버튼을 실 `PATCH scenes/{id}`로 전환, 저장 성공 시 로컬 캐시(`setSceneParagraphs`)도 갱신(에디터가 `key={scene.id}`로 리마운트될 때 stale 데이터로 되돌아가는 회귀 방지).

## 계획 대비 차이 (divergences)

1. **`Chapter` 타입에 `episodeId: string` 필드 추가** — 계획서엔 없었으나, 백엔드 씬 PATCH 경로가 `episode_id`를 필수로 요구해(`/works/{work_id}/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene_id}`) S2의 평탄화가 빠뜨린 정보를 되살릴 필요가 생겼다. S4가 이 필드를 추가했고 S3가 그대로 사용(부→화 조회 시 `partLabel`이 일치하는 기존 챕터에서 `episodeId`를 역으로 찾는 방식으로 해결).
2. **S3·S4가 `works.store.ts`/`types.ts`를 동시에 편집하며 다시 충돌 위험** — task 31과 같은 패턴(같은 파일을 병렬 슬라이스가 편집). 이번엔 두 에이전트가 서로의 변경(`episodeId` 필드, `setSceneParagraphs` 액션)을 인지하고 겹치지 않는 부분만 건드려 매끄럽게 합쳐짐 — 직접 리뷰로 중복/누락 없음 확인.
3. **`manuscript.tsx`의 화 제목 인풋이 키 입력마다 저장을 쏘던 로컬 mock 동작을 발견해 blur/Enter 커밋으로 수정**(S3) — 계획엔 없었지만 실 API 전환 시 네트워크 폭주를 막기 위한 필수 수정. 트리의 기존 `InlineEdit` blur/Enter 관례와 일치시킴.
4. **알려진 한계(발견, 이번 범위 아님)**: 하드 새로고침(SPA 네비게이션이 아닌) 시 `/works/$workId/write/$sceneId`·`/works/$workId/timeline`이 빈 화면을 렌더(콘솔 에러 없음) — S2/S4 하이드레이션 부트스트랩과 관련 있어 보이나 이 작업 범위 밖(auth/hydration 부트스트랩 손대는 건 surgical하지 않음). **후속 작업 후보로 기록.**

## 검증 (UAT)

- web: `pnpm typecheck`(clean) · `pnpm lint`(159 files, 0 errors) · `pnpm test`(17 files / 59 tests pass).
- 직접 리뷰: `works.store.ts` 전체 재확인 — 3개 슬라이스(S2/S3/S4)가 편집한 결과가 중복·데드코드 없이 일관됨.
- playwriter 실 e2e(에이전트 보고, 실 백엔드 대상): 새 부/화 생성 시 실 `POST episodes/chapters/scenes` 확인, 화·부 이름변경이 `PATCH` 후 양쪽(에디터 헤더+트리) 반영, 화·부 삭제가 실 `DELETE`(부 삭제는 cascade로 하위 전부 제거, 고아 씬 라우트는 기존 가드로 안전하게 처리) 확인, 씬 본문 저장→새로고침 없이 재확인 가능.
- DoD 충족: 작품 상세 화면이 서버의 부·챕터·씬으로 렌더, 화 추가/삭제/이름변경이 새로고침 후에도 유지.
