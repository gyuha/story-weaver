<!-- forge-slug: work-deeplink-hydration -->
# run — 작품 딥링크 하이드레이션 (2026-07-11)

Dynamic Workflow `wf_dbaad0d4-490` (직렬 S1→S2→S3 + Verify, web-feature-builder ×3 + 검증 1, eco: sonnet 캡 + ECO 주입, TDD on). 4 에이전트 전부 완료, 오류 0.

## 계획대로 된 것

- S1 — `toWork`를 `features/works/lib/work-mapping.ts`로 추출, `useHydrateWorks()`를 `features/works/lib/hydrate-works.ts`에 신설(hydrate-chapters 패턴 동일), 대시보드 재사용. 테스트 3건 선작성(TDD).
- S2 — `routes/works/$workId.tsx` 레이아웃 라우트 신설, 4분기(Outlet/스켈레톤/에러 Alert/`/works` 리다이렉트) 구현 + 분기별 테스트 4건.
- S3 — `write/index`·`read/$chapterId` beforeLoad의 `!work → /works` 제거(fast-path는 `chapters.length > 0` 가드로 유지), `read/$chapterId`에 useWorkChapters 하이드레이션·스켈레톤·에러·잘못된 챕터 교정 추가, `read/index`를 beforeLoad-only에서 `ReadIndexPage` 컴포넌트 라우트로 전환. requireAuth 3곳 유지. 테스트 8건 선작성.
- Verify — `pnpm typecheck`·`pnpm lint`(200 files clean)·`pnpm test`(38 files, **170 passed**) 전부 통과. 슬라이스 3개 완료 기준 모두 충족(파일:라인 증거 확인), Non-goals 침범 없음.

## 차이 (divergences)

1. **S2에서 스펙에 없던 실경합 버그 발견·수정** — 최초 구현은 렌더에서 캡처한 `useWork()` 값으로 리다이렉트를 판단해, 목록 조회가 막 끝난 렌더에서 스토어 반영이 리렌더에 실리기 전 `!work`가 참인 채 리다이렉트 이펙트가 실행 → 항상 `/works`로 오탐 튕김. playwriter 실브라우저 검증에서 발견, 이펙트 안에서 `useWorksStore.getState()`를 직접 읽도록 수정하고 회귀 테스트(`work-id-hydration-race.test.tsx`)로 고정. 계획이 지정한 useEffect+navigate 방식의 함정이었음.
2. S1 — 대시보드의 중복 useQuery+useEffect 배선을 훅으로 **완전 교체**(계획은 "확실할 때만" 조건부 — data가 setWorks 외 용도로 얽혀 있지 않음을 확인하고 교체).
3. S3 — read 계열 스켈레톤/에러 UI를 WorkShell로 감싸지 않고 전체화면 패턴으로 구성(ReadingScreen 자체가 크롬 없는 몰입형 뷰라 레이아웃 스켈레톤 관례를 따름).
4. S3 — beforeLoad 리다이렉트 분기의 단위 테스트는 미작성(계획의 TDD 대상은 컴포넌트 레벨 (a)(b)뿐) — typecheck + 실브라우저 확인으로 커버. 대신 컴포넌트 테스트는 관례에 맞춰 (a)(b) 2건 → 8건으로 확대.
5. **부수효과(코드 외)** — S3 에이전트가 playwriter 검증 중 로컬 백엔드의 'QA 테스트 작품'에 '새 부' 클릭으로 에피소드 1개를 추가함(챕터 유무 분기 관찰 목적). 되돌리지 않음 — 사용자에게 고지 필요.
6. S2 에이전트가 자식 라우트 beforeLoad의 잔존 튕김을 스코프 경계로 기록했고, 그 정리는 계획대로 S3가 수행(중복 아님, 순차 실행의 정상 흐름).

## 핸드오프 UAT 실패 → fix-and-re-run (세션 직접 수정)

- **최초 UAT에서 read 딥링크가 DoD 미충족**: `/works/<id>/read` 하드 로딩이 첫 챕터가 아니라 write 에디터로 귀결. 원인은 S2가 레이아웃에서 잡은 것과 동일한 스테일 클로저 경합이 S3의 read 컴포넌트 2곳(`ReadIndexPage`·`ReadPage`)에 남은 것 — chapters 쿼리 완료 커밋에서 교정 effect가 렌더 클로저의 `work`(chapters: [])를 읽고 "챕터 없음 → write"로 비가역 내비게이션. S3의 단위 테스트는 훅을 통째로 mock해 이 경합을 재현하지 못했고, S3 에이전트도 실브라우저에서 write 귀결을 보고 "유효한 화면"으로 오판·기록했다.
- **수정(TDD)**: 실제 `useWorkChapters` + manuscriptApi mock으로 경합을 재현하는 실패 테스트 3건 선작성(`read/__tests__/read-hydration-race.test.tsx`, 수정 전 3/3 실패 확인) → 두 effect가 `useWorksStore.getState()`를 직접 읽도록 수정(+`ReadPage`는 유효 chapterId면 교정 생략 가드 추가). deps는 WorkLayout 관례에 맞춰 `work` 제거(Biome useExhaustiveDependencies 준수). read 컴포넌트는 레이아웃 Outlet 안에서만 마운트되므로 works 목록은 항상 선재.
- **재검증**: 경합 테스트 3/3 통과, 전체 `pnpm test` **173 passed**, typecheck·lint(201 files) 클린, 브라우저 UAT 3 시나리오 통과.

## 현장 결정

- S2 테스트에서 selectors mock 대신 실제 `useWorksStore.setState()`로 시나리오 구성(경합 수정으로 컴포넌트가 스토어를 직접 읽게 되어 mock으로는 검증 불가).
- 신규 테스트 총 16건(S1 3, S2 4+경합 1, S3 8). 최종 170 passed.
