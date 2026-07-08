# RUN — 프로필·테마 설정 서버 영속 + 로그인 시 테마 적용

slug: user-profile-theme-persistence · task: 26 · executed: 2026-07-03

## 실행 방식

- P1 백엔드 검증(직접) → P2·P3 경량 Dynamic Workflow(eco: sonnet 상한 + ECO 규율 주입, S4·S5는 `web-feature-builder` 위임) → P4 검증·UAT(직접).
- 병렬성이 0에 가까워(S3→S4/S5→S6 직렬, S4·S5는 동일 `account-screen.tsx` 편집) 무거운 병렬 대신 2단계 직렬 파이프라인으로 실행.

## 계획대로 된 것

- **S3** 계약 재생성 + facade: `task contract`로 `docs/openapi.json` 재추출(PATCH /api/v1/auth/me·UserResponse.avatar_emoji/theme 반영 확인), `task web:generate`로 `web/src/api` 재생성(`patchApiV1AuthMe` 등), `auth.api.ts`에 `authApi.updateProfile` 추가(기존 `throwOnError: true` 패턴 준수). `task web:typecheck` 통과.
- **S4** 프로필 저장: `ProfileSection`이 초기값을 인증 사용자(`user.display_name`/`user.avatar_emoji`, null이면 fallback)에서 읽고, 저장 시 `authApi.updateProfile({ display_name, avatar_emoji })` → `setUser` + 성공 토스트, 실패 시 에러 토스트·`setUser` 미호출.
- **S5** 테마 저장 + 로그인 적용: `use-theme.ts`에 `applyTheme(theme)` 추출·공유(localStorage + `.dark` 토글, 기존 동작 불변). `ThemeSection`이 선택 즉시 적용 + `authApi.updateProfile({ theme })` persist-on-select. `SessionRestore`(`__root.tsx`)와 `login-page.tsx`가 `setUser` 직후 `user.theme`가 있으면 `applyTheme`로 서버 우선 적용.
- **S6** 검증: `task web:check`(typecheck+lint) 통과, `pnpm test` 32 passed(10 files, 신규 테스트 3파일 + login-page 1건 포함).

## 계획 대비 차이 (divergences)

1. **S1·S2가 이 fg-run 전에 이미 워킹트리에 구현돼 있었다** — 가장 큰 차이. 마이그레이션 `0003_user_profile_theme.py`·모델 컬럼·`UpdateProfileRequest`·`service.update_profile`·`repo.update_user_profile`·라우터 `PATCH /me`·`UserResponse` 확장·pytest(`TestUpdateProfile` 3종)가 이미 존재. 워크플로우는 **재구축하지 않고 검증만** 수행(auth 스위트 149 passed·1 skipped, `ruff` 통과). 계획의 설계는 그대로 실현됨(설계 miss 아님, 선행 작업 상태 차이).
2. **`user-menu.tsx`(상단바 드롭다운) 테마 선택은 여전히 로컬 전용** — 서버 미저장. S5 범위(설정 화면 `ThemeSection`)에는 없었지만, 그 경로로 테마를 바꾸면 서버에 안 남아 다른 세션에서 서버 우선 적용에 덮인다. → **후속 작업 후보**.
3. `settings.store`의 `ProfileSettings`를 `{ provider }`로 축소(displayName/avatarEmoji·`updateProfile` 제거) — 서버 이전 후 아무도 안 읽는 orphan(내 변경이 만든 dead code)이라 삭제. `provider`는 유지해 `PasswordSection`·기존 테스트 무변경.
4. S3 단계에서 계획에 없던 테스트 2파일(`signup-page.test.tsx`, `auth.store.test.ts`)의 `UserResponse` mock에 `avatar_emoji`/`theme` 추가 — 계약 재생성으로 두 필드가 필수가 돼 typecheck 통과에 필요.
5. `theme-section.test.tsx`에 jsdom `matchMedia` 스텁을 로컬 추가(useTheme의 `system` 분기가 마운트 시 호출). 전역 `test/setup.ts`는 무변경.
6. 테스트 위해 `ProfileSection`/`ThemeSection`/`SessionRestore`를 export로 전환(기존 `PasswordSection` export 선례 준수).
7. `authMutations.updateProfile`(`patchApiV1AuthMeMutation`)도 노출(계획서에서 선택사항으로 명시).

## 알려진 한계 / 검토 필요

- **폼 초기값 stale 엣지(낮음)**: `ProfileSection`은 react-hook-form `defaultValues`로 `user`를 읽는다. `defaultValues`는 최초 렌더에서만 캡처된다. 같은 기기 새로고침은 `useAuthStore` persist(localStorage `sw-auth-v3`)가 `user`를 동기 rehydrate해 정상 채워짐 → DoD 충족. 그러나 다른 기기에서 바꾼 서버 값과 영속 값이 다르면 재저장 전까지 폼이 stale일 수 있음. 필요 시 `values` prop 또는 `reset()`로 격상.
- `login-page.tsx`의 `React.FormEvent` deprecation 경고(★)는 **이번 변경 이전부터 존재**(pre-existing), 이 작업과 무관.

## 검증 (UAT)

- 직접 실행: `task web:check` 통과, `pnpm test` 32 passed, 백엔드 auth pytest 149 passed·`ruff` clean, playwriter로 로그인 페이지 렌더 스모크(파손 없음, 영속 테마 적용 확인).
- 위임 에이전트의 실제 백엔드 e2e(corroborating): signup→Mailpit 인증→로그인→`/settings/account`에서 프로필 저장이 `GET /me`에 반영, 테마 선택 즉시 다크 적용 + 서버 `theme:'dark'` 저장, localStorage `theme` 캐시 삭제 후 새로고침 시 세션 복원이 서버 값으로 다크 재적용(서버 우선 확인).
- DoD 전부 충족(프로필 저장·유지, 테마 즉시적용+서버저장, 로그아웃→재로그인 저장 테마 적용, web·api 게이트 통과).
