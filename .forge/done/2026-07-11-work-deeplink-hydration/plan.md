<!-- forge-slug: work-deeplink-hydration -->
<!-- task: 47 -->
<!-- priority: high -->
<!-- tdd: on -->
# 작품 딥링크 하이드레이션 — $workId 하위 화면 새로고침 빈 화면 수정

## Goal / Non-goals

- Goal: 작품 하위 화면(`/works/$workId/*`) 어디든 딥링크·새로고침(F5)으로 직접 진입해도 빈 화면 없이 정상 렌더된다. works 목록 하이드레이션을 대시보드 화면 결합에서 풀어 `$workId` 레이아웃 라우트에서 보장한다.
- Non-goals:
  - 하위 도메인 하이드레이션(chapters/entities/timeline/conflicts) 훅의 중복 호출 정리·구조 개편
  - works 스토어 persist (새로고침 간 로컬 편집 상태 유지)
  - 401/토큰 갱신 처리 변경 (ADR-0007로 이미 동작 — 딥링크 첫 로딩의 401은 원인 아님으로 판명)
  - `worksQueries.detail()` 단건 조회 전환 (목록 재사용이 대시보드와 캐시를 공유해 더 단순)

## Source of truth

- Glossary terms: 작품 (Work), 편집 모드 (Edit Mode), 읽기 모드 (Reading Mode) — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/0008-works-list-first-then-subdomains.md` (works 목록만 실 API — setWorks가 nested 배열을 빈 값으로 시작시키는 근거)
- 원인 규명(사전 조사 완료): works Zustand 스토어는 인메모리 `works: []`로 시작하고 `setWorks` 호출처가 `dashboard-screen.tsx` 하나뿐 → 딥링크 진입 시 `useWork()` = undefined → 각 라우트의 `if (!work) return null` 가드가 빈 화면을 만든다. 같은 URL을 `/works` 경유 클라이언트 내비게이션으로 진입하면 정상 렌더됨을 playwriter로 검증함. `read/*`·`write/index`는 `beforeLoad`에서 스토어를 동기로 읽어 `/works`로 튕김.
- 결정(그릴링): ① 레이아웃 라우트 + 컴포넌트 훅 방식 (beforeLoad-await 아님 — queryClient 라우터 컨텍스트 배선 불필요, read/index는 chapters까지 필요해 beforeLoad로는 성립 안 함) ② 하이드레이션 완료 후에도 작품 없으면 `/works`로 조용히 리다이렉트 ③ TDD on
- Definition of Done: 버그 리포트 URL(`/works/<workId>/write/<sceneId>`)을 브라우저 직접 로딩하면 에디터가 렌더되고, read 딥링크는 첫 챕터로 이동하며, 존재하지 않는 workId는 `/works`로 리다이렉트된다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices

- [ ] S1. `toWork` 매퍼를 `dashboard-screen.tsx` 로컬에서 `features/works/lib/work-mapping.ts`로 추출하고, `worksQueries.list()` + `setWorks`를 수행하는 `useHydrateWorks()` 훅을 `features/works/lib/hydrate-works.ts`에 신설(기존 `hydrate-chapters.ts` 패턴 동일 — useQuery + useEffect + isPending/isError 반환). 대시보드는 추출된 매퍼·훅을 재사용해 동작 불변. — 완료 기준: 훅의 실패 테스트 선작성 후 통과(목록 응답 → setWorks 반영, 에러 시 isError), 대시보드 기존 테스트 회귀 없음
- [ ] S2. `web/src/routes/works/$workId.tsx` 레이아웃 라우트 신설: `useHydrateWorks()` 실행 후 분기 — 작품 있음 → `<Outlet/>` · 로딩 중(작품 아직 없음) → 전면 스켈레톤 · 조회 에러 → destructive Alert · 하이드레이션 완료 & 작품 없음 → `/works` 리다이렉트. — 완료 기준: 4분기 각각의 RTL 실패 테스트 선작성 후 통과 (depends: S1)
- [ ] S3. `beforeLoad` 동기 스토어 읽기 3곳 정리: `write/index`·`read/$chapterId`의 `!work → /works` 리다이렉트 제거(레이아웃이 담당, 나머지 fast-path 리다이렉트는 유지), `read/index`는 컴포넌트를 신설해 `useWorkChapters` 하이드레이션 후 첫 챕터(챕터 없으면 `/write`)로 이동 — `write/index`의 기존 late-hydration effect와 같은 결. — 완료 기준: read 딥링크 시나리오 RTL 테스트(하이드레이션 후 첫 챕터 내비게이션) 선작성 후 통과 (depends: S2)
- [ ] S4. UAT: playwriter로 ① 버그 리포트 URL 직접 로딩 → 에디터 렌더 ② read 딥링크 새로고침 → 첫 챕터 렌더 ③ 존재하지 않는 workId → `/works` 리다이렉트를 눈으로 확인, `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과. — 완료 기준: 3개 시나리오 스크린 확인 + 3개 명령 통과 (depends: S3)
