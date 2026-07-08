# run — API 실연동 part 1: auth 세션 배선 (web)

실행 방식: Dynamic Workflow (eco on → 서브에이전트 7개 전부 `model: sonnet` + ECO 전문 주입; TDD on → 슬라이스마다 실패 테스트 선작성). 5 페이즈: Scaffold → Session core → Wire(병렬 3) → Review(적대적) → Verify. 총 ~315k 토큰, 7 에이전트.

## 계획대로 된 것

- **S1 vitest 스캐폴딩** — vitest + RTL + jsdom + setup 파일, `task web:test`(= `vitest run`), tsconfig types, 스모크 테스트. 독립 `vitest/config`(vite config 비확장)로 tanstack-router/tailwind 플러그인 회피, `@/` 별칭은 vite-tsconfig-paths로 공유.
- **S2 세션 코어** — `auth.store.ts` 실 세션 스토어로 재작성(accessToken/refreshToken/user/파생 isAuthenticated, setSession/setUser/clear, localStorage 키 `sw-auth-v2`→`sw-auth-v3`, mock isAuthenticated:true·시드 유저 제거). `api-interceptors.ts` 재작성: Bearer 주입 + 단일-비행 refresh 코디네이터(`createRefreshCoordinator`, 테스트 가능 유닛) + 401 재시도. 앱 로드 세션 복원은 `__root.tsx`의 `SessionRestore` null-component로 훅. TDD: store 라운드트립 + 동시 401→refresh 1회 테스트 통과.
- **S4/S5/S6 (병렬)** — 로그인 페이지(authApi.login→setSession→me→navigate, 에러/로딩), 회원가입 페이지(authApi.signup→"인증 메일 발송" 상태, 자동로그인·이동 없음), 가드(requireAuth 실 세션, requireAdmin→requireAuth 폴백) + 로그아웃(user-menu에서 authApi.logout→clear→redirect). 각 슬라이스 RTL/로직 테스트.
- **검증** — `task web:typecheck` clean, `task web:lint` clean(145 files), `task web:test` 19/19 pass(6 파일). 루트 `CLAUDE.md` web 섹션 "테스트 러너 없음" → vitest 도입으로 갱신.
- **비목표 준수** — OAuth/비번재설정/verify-email 랜딩 미구현, 관리자 게이팅 연기, `web/src/api/**` 미편집.

## 적대적 리뷰가 잡은 것 (Review 페이즈 — auth 고위험)

- **[HIGH, 수정됨] 401 무한루프**: refresh 호출(`authApi.refresh`)도 `client.instance`를 거치므로 `/api/v1/auth/refresh` 자체가 401이면 인터셉터가 다시 refresh를 호출 → 무한루프. URL 가드(`REFRESH_URL` 체크 시 즉시 clear+redirect, `api-interceptors.ts:71`)를 추가해 in-run 수정.
- **[LOW, 미수정] 세션 복원 transient 에러**: `SessionRestore`가 `authApi.me()` 실패 시 401이 아닌 네트워크/5xx에도 `clear()` → 일시 장애에 로그아웃. UX상 공격적이나 보안 이슈 아님. (후속 판단)
- **[LOW, 미수정] 오해 소지 주석**: `api-interceptors.ts:43-44` 주석이 "coordinator가 인터셉터에 안 걸린다"고 하나 사실과 다름(걸린다 — 그래서 위 HIGH 버그가 났음). 정정 필요.
- **[LOW, 미수정] 통합 테스트 공백**: refresh-URL bail-out 경로는 HTTP 목 라이브러리(MSW/axios-mock-adapter) 미설치라 단위 테스트 없음. 코디네이터 자체는 단위 테스트됨.

## 계획과 어긋난 것 / 현장 결정

1. **[중요·UAT에서 발견·수정됨] `/works` 대시보드 인덱스가 미가드**: `works/index.tsx`에 `beforeLoad` 가드가 없어, 로그인 후 도착지인 `/works` 대시보드가 미인증에 그대로 열려 있었다(다른 모든 보호 라우트 settings·admin·works/new·works/$workId/*는 가드 호출). 항상-true mock에 가려져 있던 갭이 실 인증에서 드러남 — DoD 시나리오 3을 깨뜨림. S6 에이전트는 가드 *함수*만 보고 "변경 불필요"라 했고 라우트 *호출 커버리지*는 점검하지 않았으며, 적대적 리뷰도 토큰 로직에 집중해 놓침. **fg-run 핸드오프 UAT(playwriter)에서 발견 → `works/index.tsx`에 `requireAuth('/works')` 1줄 추가로 in-run 수정 → 재검증(typecheck/lint clean, `/works`→`/auth/login` redirect 확인).**
2. **S2(세션 코어)의 스코프 초과**: store 인터페이스를 바꾸면(구 `login(user)` 제거) 모든 소비자(login-page/signup-page/guard/user-menu/account-screen) typecheck가 깨지므로, S2가 자신의 typecheck 게이트를 통과시키려 소비자 파일까지 모두 손댔다. 그 결과 병렬 Wave 3의 S4/S6는 "이미 배선됨"을 발견(S4는 테스트만 추가). **교훈: per-slice typecheck 게이트 하에서 공유 인터페이스를 바꾸는 슬라이스는 소비자를 함께 고쳐야 해 슬라이스 격리가 흐려진다** — 결과는 일관(typecheck+테스트 green)하나 슬라이스 경계 설계 시 고려할 점.
3. **user-menu 관리자 메뉴 항목 제거**: UserResponse에 role이 없어 admin 메뉴 항목 + `ShieldCheck` import 제거(관리자 게이팅 연기와 일관).
4. **localStorage 키 `sw-auth-v3`**: 구 `sw-auth-v2`(토큰 없는 mock 상태)는 첫 로드 시 무시되어 기존 세션은 로그아웃됨 — 의도된 동작.

## 검증 증거 (UAT)

- 자동: typecheck clean · lint clean(145) · vitest 19/19 pass(단일-비행 refresh·로그인 플로우·가입 sent-state·가드 redirect 포함).
- 브라우저(playwriter, 백엔드 미가동): 미인증 `/works`→`/auth/login?redirect=%2Fworks` redirect ✓, 잘못된 자격증명→"이메일 또는 비밀번호를 확인해주세요." 표시 + 비이동 ✓(실 API 배선 확인 — mock이면 이동했을 것), 랜딩 `/`는 공개 유지 ✓.
- **로컬 백엔드(:8080) 미가동**이라 happy-path(올바른 로그인→/works, 새로고침 세션복원, 가입 성공 안내)는 브라우저로 끝까지 확인 불가 — 해당 로직은 19개 테스트(facade 목)가 커버. 풀스택 환경에서 추후 1회 확인 권장.

## 남은 갭 (후속)

- 세션 복원 transient-에러 로그아웃(LOW) / 오해 주석 정정(LOW) / refresh-URL bail-out 통합 테스트(LOW, HTTP 목 라이브러리 필요).
- 관리자 게이팅·`/me` role·승인 상태 노출 — 후속 admin 도메인 작업(로드맵 9).
