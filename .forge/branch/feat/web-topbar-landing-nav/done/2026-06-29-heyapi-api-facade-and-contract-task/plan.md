<!-- forge-slug: heyapi-api-facade-and-contract-task -->
<!-- task: 21 -->
<!-- tdd: off -->
# Hey API 기반 API facade와 계약 갱신 태스크 추가

## 목표 / 비목표
- 목표: FastAPI가 내보낸 OpenAPI 계약(`docs/openapi.json`)을 Hey API(`@hey-api/openapi-ts`)로 읽어 web에서 사용할 도메인별 API facade를 만든다. 루트 `Taskfile.yml`에는 백엔드 OpenAPI export와 web Hey API 재생성을 한 번에 실행하는 계약 갱신 태스크를 추가한다.
- 비목표:
  - 기존 web 화면·Zustand mock-store를 실제 API 호출로 전환하지 않는다.
  - `web/src/api/**` 생성물을 직접 편집하지 않는다. 필요한 경우 `task contract`/`task web:generate`로 재생성한다.
  - OpenAPI에 아직 없는 `admin` 백엔드 endpoint용 가짜 service를 만들지 않는다.
  - SSE 전용 helper(`/chat/stream`, stream=true 메시지 전송)는 만들지 않는다. chat facade는 non-streaming JSON 경로만 안전하게 다룬다.
  - `useWorksQuery` 같은 커스텀 React hook이나 facade 전역 barrel 파일은 만들지 않는다.

## 진실의 출처
- Glossary terms: 없음 — 이 작업은 사용자 대면 도메인 용어가 아니라 API 계약·코드젠 배선 작업이다.
- Related ADRs: `.forge/branch/feat/web-topbar-landing-nav/adr/0006-code-first-openapi-contract-pipeline.md`, `.forge/adr/0001-python-backend-react-frontend.md`
- Definition of Done: 루트 `task contract`로 `api:openapi` → `web:generate`가 순서대로 실행될 수 있고, `auth`, `chat`, `works`, `health` endpoint facade가 생성 SDK를 감싸며, `web` 타입체크와 린트가 통과한다.

## 작업 조각
- [ ] S1. 현재 Hey API 계약 파이프라인을 유지하면서 루트 Taskfile에 계약 갱신 태스크를 추가한다 — completion criterion: `Taskfile.yml`에 `contract`와 `contract-check`가 생기고, `contract`는 `api:openapi` 후 `web:generate`를 실행하며, `contract-check`는 계약 갱신 후 web 검증까지 실행한다.
- [ ] S2. `works` API facade를 만든다 — completion criterion: `web/src/features/works/api/works.api.ts`가 생성 SDK의 works CRUD 함수와 TanStack Query options/mutation options를 도메인 이름(`worksApi`, `worksQueries`, `worksMutations`)으로 노출하고, 직접 호출 함수는 성공 데이터만 반환하며 `throwOnError: true`를 사용한다.
- [ ] S3. `auth` API facade를 만든다 — completion criterion: `web/src/features/auth/api/auth.api.ts`가 signup/login/logout/refresh/me/OAuth/password-reset/email-verify 계열 생성 SDK 함수와 Query/mutation option aliases를 도메인 이름으로 노출하고, 직접 호출 함수는 `throwOnError: true` 정책을 따른다.
- [ ] S4. `chat` API facade를 만든다 — completion criterion: `web/src/features/chat/api/chat.api.ts`가 non-streaming completion, provider 조회, conversation CRUD/list, message list, `stream: false` 메시지 전송 경로를 도메인 이름으로 노출한다. SSE helper는 파일에 구현하지 않고 필요 시 주석 또는 명명으로 non-streaming 범위를 분명히 한다.
- [ ] S5. `health` API facade를 shared 영역에 만든다 — completion criterion: `web/src/features/shared/api/health.api.ts`가 health/ready 직접 호출 함수와 Query options aliases를 노출한다.
- [ ] S6. 생성물과 facade 사용 가능성을 검증한다 — completion criterion: 필요한 경우 `task contract`를 실행해 Hey API 생성물을 갱신하고, `task web:typecheck`와 `task web:lint`가 통과한다. 실패하면 실패 출력과 원인을 `run.md`에 남긴다.
