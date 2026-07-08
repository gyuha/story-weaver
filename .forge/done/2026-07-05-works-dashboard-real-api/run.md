# RUN — Works 대시보드(목록·생성)를 실 Work API로 전환

slug: works-dashboard-real-api · task: 27 · executed: 2026-07-05

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입, 전 슬라이스 `web-feature-builder` 위임): Store(S1, TDD) → UI 병렬(S2 DashboardScreen·S3 NewWorkModal, 둘 다 S1에만 의존해 병렬 실행) → Cleanup(S4). S5(검증·UAT)는 직접 수행.

## 계획대로 된 것

- **S1** 스토어 계약 변경: `works.store.ts`의 `works` 초기값을 `[]`로 변경, `setWorks(serverWorks)`(기존 로컬 nested 배열 보존, 신규 id는 빈 배열) + `addWorkFromServer(work)`(완성된 Work를 그대로 push) 추가, 기존 `addWork`/`workspaceName`/`authorInitial`/`SHORT_LABEL` 제거. `selectors.ts`의 `useWorkspaceMeta()`가 `useAuthStore`의 `display_name`에서 파생(반환 shape 불변이라 `user-menu.tsx`/`sidebar-parts.tsx` 무변경).
- **S2** DashboardScreen: `useQuery(worksQueries.list())`로 목록 조회, 로딩(스켈레톤)·에러(Alert 배너) 상태 렌더, 성공 시 `setWorks`로 스토어 동기화. 기존 카드 그리드·요약 통계·`{resume && ...}` 가드 무변경.
- **S3** NewWorkModal: `useMutation(worksMutations.create())`로 제출, 성공 시 `addWorkFromServer` + 이동, 제출 중 버튼 비활성("만드는 중…"), 실패 시 인라인 에러(모달 유지). TDD red→green 확인됨(에이전트 보고).
- **S4** 데모 시드 정리: `mock/works.ts`에서 `seedWorks`(데모 챕터·엔티티·타임라인) 제거, `seedUsage` 유지. `NewWorkInput` 등 orphan 제거.
- **S5** 검증: `pnpm typecheck`/`pnpm lint`/`pnpm test` 직접 재실행 — 45 tests / 14 files 통과, 0 lint 에러. playwriter로 실 e2e UAT(아래).

## 계획 대비 차이 (divergences)

없음 — 5개 슬라이스 모두 계획한 설계대로 구현되고 검증됐다. S2의 `toWork` 매핑이 `as Work` 일괄 캐스트를 쓴 반면 S3는 필드별로 좁혀 캐스트한 점이 스타일 차이지만, 둘 다 typecheck를 통과하고 동작에 영향 없어 divergence로 기록할 정도는 아니다.

## 알려진 한계 / 후속 후보

- 이메일 인증 링크(`/auth/verify-email/{token}`)가 프론트에 라우트가 없어 백엔드 API를 직접 호출해야 UAT를 진행할 수 있었다 — **이번 작업 이전부터 있던 무관한 기존 갭**(회원가입 플로우 쪽 후속 과제 후보로 별도 기록할 만함).
- Work 수정(제목/장르 변경)·삭제 UI는 계획대로 비목표로 남겨둠(백엔드 엔드포인트는 있으나 UI 없음).

## 검증 (UAT)

- 직접 실행: `pnpm typecheck`(clean) · `pnpm lint`(154 files, 0 errors) · `pnpm test`(14 files / 45 tests pass).
- playwriter 실 e2e: 신규 계정 가입(`worksuat-*@example.com`) → mailpit 인증 메일 확인 → 백엔드 `POST /auth/verify-email/{token}` 직접 호출로 인증(프론트 라우트 부재로 인한 우회, 위 한계 참고) → 로그인 → `/works` 진입 시 **0개의 작품**(실 서버 빈 목록, 데모 시드 없음) 렌더 확인 → 사이드바에 실 사용자 정보(`U`/`UAT테스터`, mock 아님) 표시 확인 → "새 작품 만들기"로 작품 생성 → 서버 UUID(`f4a5f01a-...`)의 집필 화면으로 이동, 빈 씬 상태 정상 렌더(회귀 없음) → `/works`로 복귀 시 **1개의 작품**으로 목록 반영 확인 → **하드 리프레시 후에도 유지**(서버 영속 확인, 클라이언트 캐시가 아님).
- DoD 전부 충족: 실 목록 표시(빈 상태 포함) · 생성 작품 서버 저장·목록 반영 · 워크스페이스 이름/이니셜 실 사용자 정보 · 기존 화면 회귀 없음 · web:check/pnpm test 통과.
