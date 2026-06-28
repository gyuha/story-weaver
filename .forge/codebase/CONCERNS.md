---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-26
---

# CONCERNS — 기술 부채·위험 지도

StoryWeaver 코드베이스의 기술 부채, 알려진 이슈, 보안 민감 영역, 성능 위험, 취약·미완성 구역을 기록한다. 모든 항목은 실제 파일을 확인해 작성했다.

## 1. UI-우선 단계 — 실 API 연동 전면 미배선

이 저장소의 가장 큰 구조적 사실: web의 화면 기능 로직은 **생성된 API 클라이언트(`web/src/api/**`)나 TanStack Query를 한 곳도 호출하지 않는다.** 전부 Zustand mock 스토어로 동작한다.

확인된 근거:

- `web/src/api/` 를 import 하는 파일은 `web/src/lib/api-client.ts`와 `web/src/lib/api-interceptors.ts` 단 둘뿐이며, 둘 다 클라이언트 설정/배선용일 뿐 실제 데이터 호출이 아니다.
- `web/src/features/**` 전체에서 `useQuery` / `useMutation` / `queryOptions` 사용처가 **0건**이다. `web/src/providers/app-providers.tsx`가 `QueryClientProvider`를 깔아두지만 소비처가 없다.
- 모든 도메인 화면(world-bible, timeline, editor 등)은 `web/src/features/shared/store/works.store.ts` 한 개의 스토어를 단일 진실 공급원으로 쓴다. 이 스토어는 `web/src/features/shared/mock/works.ts`의 `seedWorks` / `seedUsage` 시드로 채워진다(`works.store.ts:72-73`).

실 API 전환 시 영향 범위: world-bible/timeline/editor의 모든 CRUD 경로를 mock 스토어 액션에서 생성된 Query 훅으로 교체해야 하며, 현재 이 작업은 **착수되지 않았다**. `[High]`

### 인터셉터/인증 헤더 미구현

`web/src/lib/api-interceptors.ts`의 요청 인터셉터는 항등 함수(`(config) => config`)다. 토큰 주입도, 401 갱신 핸들러도 없다. 주석 스스로 "현재는 목업 인증이라 토큰 주입이 없다 ... Phase 3에서 추가"라고 명시한다. 실 백엔드 연결 시 인증이 전혀 실리지 않는 상태가 출발점이다. `[High]`

## 2. `pnpm generate` 가 현재 깨져 있음 (OpenAPI 스펙 부재)

- `web/openapi-ts.config.ts`의 `input`은 `./docs/openapi.json`(web 기준 → `web/docs/openapi.json`)이다.
- 루트 `CLAUDE.md`는 생성 소스를 `docs/openapi.json`이라 적는다.
- **두 경로 모두 파일이 존재하지 않는다.** `docs/`에는 `ai-pipeline.md` 등 설계 문서만 있고 `openapi.json`이 없다. git에도 `openapi` 관련 추적 파일은 `web/openapi-ts.config.ts` 하나뿐이다.

결과: 현 시점에 `pnpm generate`를 실행하면 입력 스펙이 없어 실패한다. 한편 생성 결과물인 `web/src/api/**`(17개 파일)는 git에 커밋돼 있다 — **소스 없이 산출물만 존재**하는 상태라 재생성으로 검증·복구가 불가능하다. 백엔드 스키마가 바뀌어도 스펙을 먼저 확보하지 않으면 클라이언트를 갱신할 수 없다. `[High]`

## 3. 포트 불일치 — web 프록시 :8080 vs api 기본 :8000

- `web/vite.config.ts`의 dev 프록시: `/api` → `http://localhost:8080` (rewrite로 `/api` 접두사 제거).
- `api/README.md`의 dev 기본 포트: `:8000` (`uvicorn`, Swagger `http://localhost:8000/docs`, `api/src/core/config.py`의 `PORT` 기본값 `8000`).

로컬 풀스택 구동 시 web이 8080으로 보내지만 API는 8000에서 뜬다. 한쪽을 맞추지 않으면 프록시가 연결되지 않는다. 루트 `CLAUDE.md`도 이 불일치를 경고로 남겨 두었다. `[High]`

## 4. 생성 파일 — 손대면 안 되는 산출물

- `web/src/routeTree.gen.ts` — `@tanstack/router-plugin`이 빌드 시 생성. `web/.gitignore`에 등록돼 **git 추적 대상이 아니다**(빌드마다 재생성). 직접 수정해도 다음 빌드에서 덮어쓰여 사라진다. biome 검사 제외(`web/biome.json`의 `files.ignore`). 이 파일 안에 `biome-ignore` 주석이 21개 들어 있다(생성물 특성).
- `web/src/api/**` — `openapi-ts` 산출물. biome 검사 제외이며 tsc 대상에서도 제외. 위 2번 때문에 **재생성 불가 상태로 커밋돼 있다.** 누군가 손으로 고치면 추적이 어렵고, 스펙이 생기는 순간 `pnpm generate`가 수동 편집을 통째로 날린다.

위험 요지: 두 파일군은 "고치지 마라"가 규칙이지만, `routeTree.gen.ts`는 재생성으로 자가 복구되는 반면 `src/api/**`는 소스 부재로 자가 복구가 불가능하다. `[High]`

## 5. mock/placeholder 로직 — 실 백엔드 대체물

실제 백엔드/AI 자리를 메우는 임시 구현 목록:

- **이미지 생성 placeholder** — `web/src/features/world-bible/components/entity-form.tsx:329` `makePlaceholder()`. 이름·이모지로 결정적 data-uri SVG를 만들어 생성 이미지인 척한다(`entity-form.tsx:68-69`, `:331`). 실 생성 API로 교체 예정. SVG 텍스트는 `escapeXml`(`:325`)로 이스케이프하지만 `data:image/svg+xml,...`로 직접 렌더되므로 입력값 처리 변경 시 주의 필요. `[High]`
- **메모리/RAG mock** — `web/src/features/memory/components/memory-panel.tsx`. AI 추천 점수가 고정 상수 `MOCK_SCORES = [88, 82, 75]`(`:163`)이고 "실 구현 시 글 내용 임베딩 → 벡터 검색으로 교체"라 주석(`:150-151`). 채팅 탭은 고정 응답 `MOCK_REPLY`(`:441`, `:467`)를 돌려주는 "실제 연동 없음, ephemeral" UI(`:444`).
- **본문 선택 AI 변환 mock** — `web/src/features/editor/components/selection-ai-menu.tsx:18` `mockTransform()`. expand/shorten은 입력 기반, rewrite/tone은 고정 예시(`:17`).
- **AI 초안 삽입 mock** — `web/src/features/editor/components/manuscript.tsx:38` `MOCK_DRAFT` 상수를 에디터에 삽입(`:96`).
- **시드 데이터** — `web/src/features/shared/mock/works.ts`(406줄)가 작품·에피소드·챕터·씬·엔티티·사용량 전체를 하드코딩한다.

## 6. 인증 — 전부 mock, 검증 없음

`web/src/features/auth/store/auth.store.ts`: 초기 상태가 `isAuthenticated: true`로 **시드 로그인된 채 시작**하며, 작가 정보(`baekya@storyweaver.kr`)가 박혀 있다. `persist` 미들웨어로 `localStorage`(`sw-auth`)에 영속화.

`web/src/features/auth/components/login-page.tsx`: `submit`이 입력값 검증 없이 `login({ email })` 후 곧장 리다이렉트(`:14-18`). 비밀번호 기본값이 코드에 `'storyweaver'`로 박혀 있다(`:12`). 회원가입(`signup-page.tsx`)도 동일하게 백엔드 호출 없이 로컬 상태만 세팅(`:19`, `:25-29`).

`web/src/features/auth/lib/guard.ts`의 `requireAuth`는 클라이언트 `localStorage` 상태만 확인 — 서버 검증이 없으므로 게이트로서 신뢰할 수 없다. 실 인증 도입 전까지 이 전 구간은 보안 기능이 아니라 화면 흐름용 stub다. `[High]`

## 7. 백엔드 보안 민감 영역 (api/)

- **기본 시크릿이 운영 위험 문구 그대로** — `api/src/core/config.py:288` `secret_key = SecretStr("change-me-in-production")`, `:327` `jwt_secret_key = SecretStr("change-me-jwt-secret-key")`. 배포 시 환경변수로 반드시 덮어써야 한다. `[High]`
- **LLM 프로바이더 API 키** — `config.py:126-145`에 OpenAI/Anthropic/Gemini/Azure 키 필드(`SecretStr`, 기본 빈 문자열). `active_api_key`(`:209`)가 평문 문자열을 반환한다. 키 취급 경로 점검 대상.
- **CORS** — `api/src/main.py:131-133`에서 `allow_credentials=True` + `allow_origins=settings.cors_origins_list`. 오리진 목록은 env로 주입(`config.py:292`, 기본 `localhost:3000,localhost:8000`). credentials 허용 상태이므로 운영 오리진 설정을 좁게 유지해야 한다. `[Medium]`

## 8. 테스트 커버리지 — web 러너 부재

- **web에 테스트 러너가 없다.** `web/package.json` scripts에 test가 없고, 의존성에 vitest/jest/testing-library/playwright가 전혀 없다. 검증 수단은 `pnpm typecheck`(`tsc --noEmit`)와 `pnpm lint`(biome)뿐. 즉 web의 동작 회귀를 잡는 자동화가 없다 — 화면 동작 검증은 사람이 직접(또는 playwriter MCP로) 해야 한다. `[High]`
- 대조적으로 **백엔드 api는 테스트 인프라가 갖춰져 있다** — `api/pyproject.toml`에 pytest/pytest-asyncio/pytest-cov/fakeredis, `api/tests/` 디렉터리, `htmlcov` 커버리지 산출물 존재. 즉 테스트 공백은 web에 국한된 위험이다.

## 9. 비대·복잡 컴포넌트 (유지보수 위험)

단일 파일이 큰 곳 — mock 로직과 UI가 한 컴포넌트에 섞여 있어 실 API 전환 시 분해 부담이 크다:

- `web/src/features/memory/components/memory-panel.tsx` — 577줄 (mock 추천·mock 채팅·패널 UI 혼재).
- `web/src/features/world-bible/components/entity-form.tsx` — 380줄 (`makePlaceholder`·`RepeatEditor` 등 포함).
- `web/src/features/editor/components/manuscript.tsx` — 378줄 (tiptap 에디터 + mock 초안 + 스토어 액션).
- `web/src/features/shared/store/works.store.ts` — 311줄. 모든 도메인이 의존하는 단일 스토어라 결합도가 높다.

## 10. TODO/FIXME/HACK 및 표식

- 표준 `TODO`/`FIXME`/`HACK`/`XXX`/`@deprecated` 주석은 **web/src·api/src 소스에 거의 없다.** api 쪽 단 1건은 문서 예시(`api/src/core/config.py:491`의 `MAIL_PASSWORD=SG.xxx` — docstring 내 샘플)로 실제 결함 표식이 아니다.
- 대신 이 저장소는 미완성을 `// eco:` / `// ponytail:` 형태의 주석으로 표시한다. mock·교체 예정 지점이 여기에 모여 있다:
  - `web/src/features/world-bible/components/entity-form.tsx:68`, `:328` (`eco:` placeholder 교체 예정)
  - `web/src/features/memory/components/memory-panel.tsx:151`, `:440` (`eco:` mock 점수·응답 교체 예정)
  - `web/src/features/editor/components/selection-ai-menu.tsx:17` (`eco:` mock 변환 교체 예정)
  - `web/src/features/shared/store/works.store.ts:179` (`ponytail:` 부 병합을 "mock 단계 수용"이라 명시)
- 타입 우회(`as any`/`@ts-ignore`/`@ts-expect-error`)는 web 기능 코드에서 발견되지 않았다. `biome-ignore`는 일부 컴포넌트에 소수 존재(`memory-panel.tsx` 3건 등, 예: `:484` 채팅 리스트의 `noArrayIndexKey` 의도적 억제) — 대부분 의도적·국소적.

## 11. 환경 설정 마찰

- **web .env 예시 파일 없음** — `VITE_API_BASE_URL`을 `web/src/lib/api-client.ts:5`에서 읽지만(`?? '/api'` 폴백), `web/`에 `.env.example`이 없다. 반면 백엔드는 `api/.env.example`을 제공한다. web의 환경변수 계약이 코드에만 암묵적으로 존재한다. `[Medium]`
