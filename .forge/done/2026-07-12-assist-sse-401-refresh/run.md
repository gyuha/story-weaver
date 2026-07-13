<!-- forge-slug: assist-sse-401-refresh -->
# run — assist SSE 401 refresh 재시도 (2026-07-12)

단일 web-feature-builder 에이전트 직접 실행(워크플로우 생략 — 소규모라 fg-run 비용 추정 규칙 적용, eco: sonnet 캡 + ECO 주입, TDD on). 검증 명령은 메인 세션에서 재확인.

## 계획대로 된 것

- S1 — `api-interceptors.ts`에 `refreshAccessToken()` export(기존 앱 레벨 coordinator 위임 — 단일-비행 유지, 인터셉터 로직 무변경) + `assist.api.ts` fetch 401 처리: refresh → 새 Authorization으로 1회 재시도 → 재401 시 clear + `/auth/login`, refresh 실패 시 이동만(clear는 coordinator 내부가 이미 수행 — 기존 인터셉터와 동일한 중복 방지). 401 외 경로 불변.
- TDD — 3시나리오 실패 테스트 선작성(레드 확인) 후 구현: ① 401→refresh→새 토큰 재시도 정상 스트리밍 ② refresh 실패→클리어+로그인 이동(재시도 없음) ③ 재시도 후 401→클리어+로그인 이동(fetch 총 2회).
- S2(명령 검증) — `pnpm typecheck`·`pnpm lint`(201 files) 클린, assist 테스트 9/9, 전체 **178/178 passed** — 메인 세션에서 직접 재확인.

## 차이 (divergences)

1. **S2의 playwriter 브라우저 UAT 미수행** — playwriter가 "Multiple extensions connected" 오류(Chrome 다중 프로필 각각에 확장이 붙어 선택 불가)로 3회 시도 모두 실패, 도구 문제로 차단. TDD 슬라이스 테스트 3건이 DoD 동작(자동 갱신 스트리밍·로그인 이동)을 결정적으로 고정하므로 이를 검증 증거로 대체. 실 브라우저 확인이 필요하면: 개발자도구 콘솔에서 `sw-auth`의 access_token을 변조 후 이어쓰기 → 자동 갱신되어 정상 스트리밍되는지 확인(수동 절차를 핸드오프에 안내).
2. `window.location.href` mock 관례가 저장소에 없어 신규 도입(`Object.defineProperty`, eco 주석) — 기존 interceptors.test.ts는 리다이렉트 분기를 커버하지 않았음.
3. `refreshAccessToken` 자체의 단위 테스트는 별도 파일 대신 assist 테스트에서 모킹 위임 계약으로 간접 커버(계획의 "없으면 간접 커버" 조항 적용).

## 후속 후보

- playwriter 다중 프로필 확장 충돌 — 사용 프로필 하나만 확장을 켜두거나 extensionId 지정 지원 확인(도구 환경 문제, 코드 아님).
