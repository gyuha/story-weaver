---
last_mapped_commit: 61e6d7ef52b84d30b9eed65c7b270e1e10a14e3b
mapped: 2026-06-18
---

# CONCERNS — 기술 부채·버그·보안·취약 영역

StoryWeaver 모노레포(`api/` FastAPI, `web/` React+Vite)의 구현 사실 기반 리스크 맵. 각 항목은 직접 코드 확인으로 검증했고, 미검증 추론은 `[추정]`으로 표시했다. 심각도는 낮음/중간/높음.

---

## 1. web 인증: 두 갈래 구현 공존 — dead path 존재 (심각도: 중간)

`web/src/features/auth/` 안에 **서로 무관한 두 인증 구현**이 동시에 존재한다.

### 1-A. 살아있는 경로 (라우트가 실제로 쓰는 것)

흐름: 라우트 → auth 컴포넌트 → helpdesk 훅 → 생성된 SDK.

```
routes/auth/login.tsx  → HdLoginPage  (features/auth/components/hd-login-page.tsx)
routes/auth/signup.tsx → HdSignupPage (features/auth/components/hd-signup-page.tsx)
                            ↓
                         useLogin / useSignup (features/helpdesk/hooks/use-auth.ts)
                            ↓
                         postAuthLogin / postAuthSignup (src/api/sdk.gen.ts) → 실제 백엔드
```

- `web/src/routes/auth/login.tsx:2,10` — `HdLoginPage`만 import/사용.
- `web/src/routes/auth/signup.tsx:2,10` — `HdSignupPage`만 import/사용.
- `web/src/features/auth/components/hd-login-page.tsx:4` — `useLogin`을 `features/helpdesk/hooks/use-auth`에서 가져온다.

### 1-B. 죽은 경로 (어떤 라우트도 참조하지 않음)

다음 4개 파일은 서로만 import하는 자기완결 클러스터이고, 라우트·`main.tsx`·`__root.tsx` 어디서도 import되지 않는다(grep으로 확인). 즉 **빌드에는 포함될 수 있으나 런타임에 도달 불가능한 dead code**다.

- `web/src/features/auth/components/login-form.tsx` — `useLoginMutation` 사용.
- `web/src/features/auth/components/signup-form.tsx` — `useSignupMutation` 사용.
- `web/src/features/auth/hooks/use-auth-mutation.ts` — `mockLogin`/`mockSignup` 호출.
- `web/src/features/auth/lib/mock-auth-api.ts` — 가짜 API.

부속물(역시 죽은 경로 전용): `web/src/features/auth/schema/auth.schema.ts`(login-form/signup-form만 사용), `web/src/features/auth/types/auth.ts`의 `AuthResponse`/`LoginInput`/`SignupInput`(use-auth-mutation·mock-auth-api 전용).

리스크: 어느 쪽이 정본인지 코드만 봐서 헷갈린다. 후속 작업자가 dead path(`login-form` 계열)를 수정하고 화면에 안 나와 시간을 버릴 수 있다. 정리(삭제) 대상 후보지만, **이 맵은 발견만 기록**한다.

---

## 2. web 인증 UI가 helpdesk 도메인에 결합 (심각도: 중간)

살아있는 인증 화면(`features/auth/`)이 `features/helpdesk/`에 강하게 의존한다. 인증과 헬프데스크는 별개 관심사인데 디렉터리 경계를 넘어 엮여 있다.

- `web/src/features/auth/components/hd-login-page.tsx:3-4` — `HdIcon`(`features/helpdesk/components/ui/hd-icon`), `useLogin`(`features/helpdesk/hooks/use-auth`)을 helpdesk에서 import.
- `web/src/features/auth/components/hd-signup-page.tsx` — 동일하게 helpdesk UI/훅에 의존.
- 화면 카피 자체가 헬프센터용("헬프센터 계정으로 로그인하세요", "1:1 문의", "FAQ" 등, `hd-login-page.tsx:11-21,53`)이라 StoryWeaver 제품 문맥과 어긋난다. 부트스트랩 템플릿 잔재.

리스크: helpdesk feature를 정리/삭제하면 인증 화면이 깨진다. 도메인 경계가 사실상 없는 상태.

---

## 3. helpdesk feature 대부분이 미배선 dead code (심각도: 낮음)

`features/helpdesk/`에서 라우트로 연결된 것은 `hd-icon`, `use-auth`, `hd-toast`(`HdToastHost`가 `__root.tsx:4,23`에서 사용)뿐이다. 나머지 게시판/관리자 컴포넌트·훅은 어떤 라우트에서도 import되지 않는다(grep 확인).

미배선 파일들:
- `web/src/features/helpdesk/components/admin-app.tsx`, `board-view.tsx`, `post-editor.tsx`, `post-detail.tsx`, `my-activity.tsx`, `sidebar.tsx`
- `web/src/features/helpdesk/hooks/use-posts.ts`, `use-admin.ts`
- `web/src/features/helpdesk/store/board.store.ts`

리스크: 낮음(런타임 영향 없음). 단 코드 부피·혼란 비용. 부트스트랩 헬프데스크 데모의 잔재로 보인다 `[추정]`.

---

## 4. 로그인 후 랜딩이 임시 플레이스홀더 (심각도: 낮음)

`web/src/routes/index.tsx`는 실제 작업 공간이 아니라 안내 문구만 있는 정적 페이지다. 본문에 "작업 공간(World Bible · 메모리 · Smart Editor)은 MVP 마일스톤에서 구현됩니다"라고 명시되어 있고, 로그인 성공 시 이 페이지로 이동한다(`routes/auth/login.tsx:10` → `navigate({ to: '/' })`).

리스크: 낮음(의도된 미구현). 제품 핵심 화면이 아직 없음을 나타내는 지표.

---

## 5. mock 인증 + 토큰 처리 미완성 지점 (심각도: 중간)

### 5-A. mock API가 dead path에 살아있음
`web/src/features/auth/lib/mock-auth-api.ts`는 `setTimeout` 지연 후 가짜 사용자 객체를 반환하고, `fail@example.com`/`taken@example.com`을 하드코딩 에러로 처리한다. 위 1-B의 죽은 경로 전용이라 현재 화면엔 영향 없지만, 정본 코드 옆에 가짜 API가 공존한다.

### 5-B. 빈 문자열 토큰 저장 (dead path)
`web/src/features/auth/hooks/use-auth-mutation.ts:15` — `setAuth({ email: ..., role: 'USER' }, '')`로 **토큰 자리에 빈 문자열**을 넣는다. 또한 같은 훅의 `onSuccess`는 로그인 성공 후 다시 `/auth/login`으로 navigate한다(`:16`) — 로직상 무의미. dead path이므로 런타임 영향은 없으나 미완성 코드의 증거.

### 5-C. 살아있는 경로의 refresh token 폴백
`web/src/features/helpdesk/hooks/use-auth.ts:12` — `setTokens(data.data.accessToken, data.data.refreshToken ?? '', ...)`. 백엔드가 refreshToken을 응답에 안 주면 빈 문자열을 저장한다. 그리고 web 어디에서도 `postAuthRefresh`(SDK에 존재)를 호출하지 않아 **토큰 갱신 미구현** 상태다.

---

## 6. web 인증 상태가 장식용 — 라우트 가드 부재 (심각도: 높음)

라우트 어디에도 인증 가드가 없다. `web/src/routes/` 전체에서 `beforeLoad`/`redirect`/`isAuthenticated` 검사 grep 결과 0건.

- `auth.store.ts`의 `isAuthenticated`는 set만 되고 라우팅 보호에 쓰이지 않는다.
- 따라서 미인증 사용자도 모든 라우트(`/` 포함)에 직접 접근 가능. 현재는 `/`가 플레이스홀더라 노출 데이터가 없지만(항목 4), 실제 작업 공간이 생기면 보호 누락이 곧바로 취약점이 된다.

### 6-A. 401 재시도/토큰 갱신 인터셉터 부재
`web/src/lib/api-interceptors.ts:5` 주석에 "401 응답 인터셉터(토큰 갱신)는 Phase 3에서 구현 예정". 요청 인터셉터로 `Authorization: Bearer` 주입만 있고(`:6-12`), 401 처리·자동 갱신 없음. access token TTL이 15분(`api/src/core/config.py:329`)이라 만료 시 사용자가 조용히 끊긴다.

### 6-B. 토큰은 인메모리만
`auth.store.ts:22-23` 주석대로 토큰을 localStorage에 저장하지 않는다(XSS 방지 의도). 새로고침 시 인증 상태가 날아간다. 의도된 선택이나, 갱신 로직(6-A)이 없으면 UX상 새로고침마다 재로그인 필요. `[추정]` Phase 3 httpOnly 쿠키 전환 전까지의 과도기.

---

## 7. api ↔ web SDK 도메인 드리프트 (심각도: 높음)

생성된 web SDK(`web/src/api/sdk.gen.ts`)가 **실제 백엔드에 존재하지 않는 엔드포인트**를 다수 포함한다. SDK는 boards/posts/comments/admin/samples 엔드포인트를 노출하지만:

- 실제 api 라우터는 auth와 chat 둘뿐이다. `api/src/main.py:227-241`에서 `auth_router`, `chat_router`만 `/api/v1` prefix로 등록.
- DB 마이그레이션(`api/alembic/versions/0001_initial_schema.py`)이 만드는 테이블도 auth 계열(users/roles/permissions/refresh_tokens/email_verifications/password_resets/oauth_accounts) + chat 계열(conversations/messages)뿐. boards/posts/comments 테이블 없음.

SDK가 노출하는 유령 엔드포인트(백엔드 부재): `getBoardsByBoardId`, `getBoardsByBoardIdPosts`, `postBoards`, `postBoardsByBoardIdPosts`, `getPostsByPostId`, `postPostsByPostIdComments`, `getAdminUsers`, `postAdminUsersByIdPasswordReset`, `getSamples`/`postSamples` 등.

원인 `[추정]`: SDK가 부트스트랩 템플릿의 헬프데스크 OpenAPI 스펙에서 생성되었고, 실제 api는 그 스펙과 무관하게 auth+chat만 구현됨. helpdesk 컴포넌트(항목 3)가 이 유령 엔드포인트를 호출하는 구조라 배선되더라도 런타임 404가 난다.

리스크: 높음. 타입은 통과하지만 호출 시 실패. SDK 재생성 기준이 되는 실제 OpenAPI와 동기화 필요.

---

## 8. api: 부트스트랩 템플릿 — StoryWeaver 도메인 부재 (심각도: 높음, 설계상 미구현)

api는 cookiecutter/부트스트랩 기반이라 StoryWeaver 실제 도메인(World Bible·작품·씬 등)이 **아직 없다**. 구현된 도메인은 `api/src/domains/` 아래 `auth`, `chat`, `shared`뿐.

- `auth` — JWT + OAuth(google/kakao/naver) + RBAC. 비교적 완성도 있음(테스트 다수: `api/tests/auth/`).
- `chat` — LLM 프록시·SSE 스트리밍(litellm). StoryWeaver 집필 LLM의 *기반*이지 도메인 로직 아님.
- 설계 문서(`docs/PRD.md`, `docs/data-model.md`, `docs/ai-pipeline.md` 등)와 코드 사이에 큰 격차. 문서가 묘사하는 핵심 도메인이 코드에 미존재.

리스크: 높음(제품 미완성의 핵심 지표). 단 의도된 단계적 구현으로 보임. 문서를 코드의 현재 상태로 오해하지 말 것.

---

## 9. 보안 민감 지점 (심각도: 중간)

### 9-A. 기본 시크릿이 "change-me" 플레이스홀더
`api/src/core/config.py`:
- `:288` `secret_key: SecretStr("change-me-in-production")`
- `:327` `jwt_secret_key: SecretStr("change-me-jwt-secret-key")`

운영에서 미설정 시 알려진 기본값으로 JWT 서명 → 토큰 위조 가능. 프로덕션 환경에서 이 기본값을 거부하는 가드(예: `is_production()` 시 검증)는 코드상 확인되지 않음. `[추정]` 배포 시 .env 주입에 의존.

### 9-B. `.env` 비밀 누출 위험 — 현재는 안전
- 로컬에 `api/.env`가 존재한다.
- 단 git에는 **추적되지 않는다**(`git ls-files api/.env` → 결과 없음). `.gitignore:107-108`이 `.env`/`.env.prod`를 명시 차단하고 `.env.example`/`.env.prod.example`만 추적.
- 로컬 `api/.env` 값은 실제 시크릿이 아니라 플레이스홀더로 확인됨: `SECRET_KEY=change...`, `JWT_SECRET_KEY=change...`, `OPENAI_API_KEY`(길이 6), `ANTHROPIC_API_KEY`(길이 10), `GOOGLE_CLIENT_SECRET`(길이 25, `your-g...`) — 실제 키 형식이 아님.

리스크: 현재 누출 없음. 단 `.env`에 실제 키를 채우는 순간 위험으로 전환되므로 규율 유지 필요(`api/CLAUDE.md`도 "절대 커밋 금지" 명시).

### 9-C. OAuth state Redis 키
`api/src/domains/auth/router/auth_router.py`에 OAuth state를 `{_OAUTH_STATE_PREFIX}{state}` 형태로 Redis에 보관. CSRF state 검증 구조 존재. 상세 검증 로직은 미정밀 확인 `[추정 — 별도 점검 권장]`.

---

## 10. 빌드 경고: 청크 500kB 초과 (심각도: 낮음)

`npm run build` 실행 결과 메인 청크가 한도를 넘는다.

```
dist/assets/index-CdlYtgqm.js   637.37 kB │ gzip: 207.99 kB
(!) Some chunks are larger than 500 kB after minification.
```

- `web/vite.config.ts`에 `manualChunks`나 `chunkSizeWarningLimit` 설정 없음. autoCodeSplitting(라우터)만 켜져 있어 라우트별 작은 청크(login 3.2kB, signup 4.1kB)는 분리되나, 공통 벤더(react-query, motion, zod, react-hook-form 등)가 단일 메인 청크에 뭉친다 `[추정]`.

리스크: 낮음(기능 영향 없음). 초기 로딩 성능 저하 요인.

---

## 11. 기타 부트스트랩 잔재

### 11-A. `/sample` 경로 참조하나 라우트 파일 없음 (심각도: 낮음)
`web/src/sample/layout/navigation.ts:22-31`이 `/sample/...` 경로 상수를 다수 정의하고 `__root.tsx:6,19`가 `isSamplePath()`로 분기하지만, `web/src/routes/sample/` 디렉터리는 없고 `routeTree.gen.ts`에 sample 참조 0건. 즉 코드가 가리키는 라우트가 실재하지 않는 dead 분기.

### 11-B. `i18n`/sample 레이아웃 잔재 (심각도: 낮음)
`web/src/sample/`(i18n, layout) 디렉터리가 부트스트랩 데모용으로 남아 있다. `main.tsx:4`가 `@/sample/i18n`을 import해 i18n 초기화는 실제로 로드됨.

---

## 우선순위 요약

| # | 항목 | 심각도 | 성격 |
|---|------|--------|------|
| 6 | 라우트 가드/401 갱신 부재 | 높음 | 보안·미완성 |
| 7 | api↔web SDK 도메인 드리프트(유령 엔드포인트) | 높음 | 정합성 |
| 8 | api StoryWeaver 도메인 부재 | 높음 | 미구현(설계상) |
| 1 | web 인증 두 갈래 + dead path | 중간 | 기술 부채 |
| 2 | 인증 UI ↔ helpdesk 결합 | 중간 | 결합도 |
| 5 | mock 인증·토큰 미완성 | 중간 | 미완성 |
| 9 | 기본 시크릿·.env 규율 | 중간 | 보안 |
| 3 | helpdesk dead code | 낮음 | 기술 부채 |
| 4 | 랜딩 플레이스홀더 | 낮음 | 미구현 |
| 10 | vite 청크 500kB | 낮음 | 성능 |
| 11 | /sample·i18n 잔재 | 낮음 | 기술 부채 |
