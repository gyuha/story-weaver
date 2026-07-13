<!-- forge-slug: assist-sse-401-refresh -->
<!-- task: 49 -->
<!-- priority: high -->
<!-- tdd: on -->
# assist SSE 스트림 401 시 refresh 재시도 — 세션이 refresh 토큰 수명까지 이어지게

## Goal / Non-goals

- Goal: assist SSE fetch(이어쓰기 등 5작업)가 401을 받으면 기존 단일-비행 refresh coordinator로 토큰을 갱신해 **1회 재시도**하고, 재실패(재401·refresh 실패) 시 기존 axios 인터셉터와 동일하게 세션 클리어 + `/auth/login` 리다이렉트한다. 결과: 집필 중 access 토큰(15분)이 만료돼도 이어쓰기가 끊기지 않고, 체감 세션이 refresh 토큰 수명(7일)까지 이어진다.
- Non-goals:
  - 토큰 TTL 변경 (access 15분·refresh 7일 유지 — 그릴링 확정, localStorage 보관이라 연장은 보안 리스크만 키움)
  - 선제 갱신(만료 임박 사전 refresh) — ADR-0007의 반응형 정책 유지 (YAGNI)
  - httpOnly 쿠키 전환 (ADR-0007의 업그레이드 경로 — 별도 태스크)
  - 다른 SSE/raw fetch 경로 — 조사 결과 인터셉터 우회 경로는 `assist.api.ts` 하나뿐(chat UI는 mock)

## Source of truth

- Glossary terms: 편집 모드 (Edit Mode) — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/0007-frontend-session-token-handling.md` (localStorage + 반응형 401 단일 refresh — 이 태스크는 그 정책을 assist 경로에 동일 적용)
- 원인 규명(사전 조사 완료): `web/src/features/editor/api/assist.api.ts`는 SSE 스트리밍 때문에 axios 대신 raw `fetch`를 사용(102행) — 401 단일-비행 refresh는 `web/src/lib/api-interceptors.ts`의 **axios response 인터셉터에만** 걸려 있어 assist 경로가 통째로 우회. access 토큰(15분) 만료 후 이어쓰기를 누르면 `assist stream failed: 401`(114행)이 그대로 사용자에게 노출됨(스크린샷 재현). 앱 레벨 coordinator 인스턴스는 현재 **미export**(팩토리 `createRefreshCoordinator`만 export).
- 미러링할 기존 정책(api-interceptors.ts 76-117행): 401 → RETRIED 마킹 → `coordinator.refresh()`(단일-비행, 성공 시 setSession/실패 시 clear) → 새 토큰으로 1회 재시도 → 재시도 후 401 또는 refresh 실패 → `useAuthStore.clear()` + `window.location.href = '/auth/login'`.
- Definition of Done: access 토큰이 만료된 상태에서 이어쓰기를 실행하면 사용자 개입 없이 refresh 후 정상 스트리밍되고, refresh 토큰까지 무효면 로그인 화면으로 이동한다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices

- [ ] S1. `api-interceptors.ts`의 앱 레벨 coordinator를 재사용 가능하게 export(예: `refreshAccessToken(): Promise<string>` 헬퍼 — 단일-비행 보장은 기존 인스턴스 재사용으로 유지) + `assist.api.ts`의 fetch 401 처리: refresh → 새 Authorization으로 fetch 1회 재시도 → 재401/refresh 실패 시 clear + `/auth/login` 리다이렉트(기존 인터셉터 정책 그대로). 401 외 오류는 기존 동작 유지. — 완료 기준: 실패 테스트 3시나리오 선작성(① 401 → refresh → 재시도 성공 스트리밍 ② refresh 실패 → clear+리다이렉트 ③ 재시도 후에도 401 → clear+리다이렉트) 후 통과, 기존 assist·인터셉터 테스트 회귀 없음
- [ ] S2. 검증: `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과 + playwriter UAT — localStorage의 access 토큰을 변조(만료 상황 재현)한 뒤 이어쓰기 실행 → 자동 refresh 후 후보가 정상 스트리밍됨을 확인, refresh 토큰까지 변조 시 로그인 화면 이동 확인. — 완료 기준: DoD 충족 (depends: S1)
