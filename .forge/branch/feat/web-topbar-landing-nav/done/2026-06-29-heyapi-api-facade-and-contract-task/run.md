# run — Hey API 기반 API facade와 계약 갱신 태스크 추가

실행 방식: Dynamic Workflow가 아니라 **직접 실행**. 작업 규모가 작고(신규 파일 4개 + 루트 Taskfile 1곳 추가) SDK 표면을 이미 본 세션 컨텍스트에 확보한 상태라, 6개 서브에이전트로 분산하면 각자 동일한 생성 코드(~2,200줄)를 중복으로 읽어야 해 비효율적이었다. fg-run의 "단일 에이전트로 충분하면 워크플로우를 건너뛰고 직접 처리" 예외 + eco 모드(`eco: true`)에 따라 직접 실행을 택했다.

## 계획대로 된 것

- **S1** — 루트 `Taskfile.yml`에 `contract`(`api:openapi` → `web:generate`)와 `contract-check`(`contract` → `web:check`) 추가. `task --list`에 둘 다 노출되고, `task contract --summary` / `task contract-check --summary`가 오류 없이 해석됨 → 참조 서브태스크(`api:openapi`, `web:generate`, `web:check`)가 모두 유효함을 확인.
- **S2** — `web/src/features/works/api/works.api.ts`: `worksApi`(list/create/detail/update/remove, 모두 `throwOnError: true`로 성공 데이터만 반환), `worksQueries`(list/detail), `worksMutations`(create/update/remove).
- **S3** — `web/src/features/auth/api/auth.api.ts`: `authApi`(signup/verifyEmail/login/refresh/logout/me/passwordReset/passwordResetConfirm/oauthLogin/oauthCallback), `authQueries`(me/oauthLogin/oauthCallback), `authMutations`(7종).
- **S4** — `web/src/features/chat/api/chat.api.ts`: `chatApi`(complete/provider/conversations/createConversation/conversation/messages/sendMessage), `chatQueries`(4종), `chatMutations`(complete/createConversation/sendMessage). non-streaming JSON 경로만 다루고 SSE(`postApiV1ChatStream`, stream:true)는 의도적으로 감싸지 않음을 파일 상단 주석으로 명시.
- **S5** — `web/src/features/shared/api/health.api.ts`: `healthApi`(health/ready), `healthQueries`(health/ready). mutation 없음.
- **S6** — `pnpm typecheck` exit 0, `pnpm lint` exit 0(137 파일, 수정 없음).

## 계획과 어긋난 것 / 현장 결정

1. **`task contract`를 실제로 실행하지 않음.** 계획 S6는 "필요한 경우 task contract를 실행"이라 했는데, SDK 생성물(`web/src/api/**`)이 이미 존재하고 최신이라 재생성할 필요가 없었다. 실제 실행은 `uv run python scripts/export_openapi.py`(api uv 환경 필요)를 거쳐 변경 없는 산출물을 다시 만드는 부수효과뿐이라, 대신 `task --summary`로 태스크 해석·참조 유효성만 검증했다. DoD의 "순서대로 실행될 수 있고"(실행 가능성)는 충족.

2. **`auth.refresh` / `auth.logout` 파라미터를 required로 정정.** 처음에 `options?`(optional)로 두었으나 `RefreshRequest`/`LogoutRequest` body가 required라 typecheck가 거부(TS2345). `options: Options<...>`(required)로 고쳐 통과. 다른 POST 직접 호출(create/complete/sendMessage 등)도 body required라 required 파라미터로 둠. body 없는 GET(list/me/provider/conversations 등)은 `options?` 유지.

3. **facade 네이밍 컨벤션을 전 도메인에 확장.** 기존 facade가 하나도 없어 따라갈 패턴이 없었다. works 완료 기준의 `worksApi`/`worksQueries`/`worksMutations`를 표준으로 보고 auth/chat/health에도 `<domain>Api`/`<domain>Queries`/`<domain>Mutations`로 일관 적용. health는 mutation 엔드포인트가 없어 `healthMutations`를 만들지 않음(계획 S5도 Query options만 요구).

4. **`web/src/features/chat/` 디렉터리 신규 생성.** chat은 아직 feature 디렉터리가 없던 도메인이라 `api/` 서브디렉터리만 새로 만들었다(컴포넌트·스토어 등은 비목표).

5. **query/mutation option import 경로.** `@/api` 배럴(index.ts)은 sdk.gen + types.gen만 재노출하고 `@tanstack/react-query.gen`의 options/mutations는 노출하지 않는다. 따라서 option alias는 `@/api/@tanstack/react-query.gen`에서 직접 import.

## 조건부 코드 리뷰 (§3) — 생략

API 계약 배선을 건드리지만 UI-mock 단계의 facade 스캐폴딩이다: auth 로직·데이터 변경·마이그레이션을 실행하지 않고, 화면에 배선되지도 않은 생성 코드 얇은 pass-through 래퍼다. typecheck+lint로 검증되는 저위험 변경이라 별도 적대적 리뷰 페이즈는 두지 않았다(§3의 trivial/저위험 생략 기준).

## 비목표 준수 확인

- 기존 화면·Zustand mock-store를 실제 API로 전환하지 않음.
- `web/src/api/**` 생성물 직접 편집 안 함.
- admin 가짜 service 안 만듦(OpenAPI에 없음).
- SSE 전용 helper 안 만듦(chat은 non-streaming만).
- 커스텀 React hook(`useWorksQuery` 등)·전역 barrel 파일 안 만듦.
