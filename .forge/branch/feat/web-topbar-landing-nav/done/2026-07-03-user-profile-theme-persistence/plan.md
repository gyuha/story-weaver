<!-- forge-slug: user-profile-theme-persistence -->
<!-- task: 26 -->
<!-- tdd: on -->
# 프로필·테마 설정 서버 영속 + 로그인 시 테마 적용

`/settings/account`의 프로필(표시 이름·아바타 이모지)과 테마 설정을 **서버에 저장**하고, 저장된 테마를 **로그인/세션 복원 시 적용**한다. 현재 둘 다 클라이언트 mock(`settings.store` localStorage 'sw-settings', `useTheme` localStorage 'theme')이라 기기·세션을 넘어 유지되지 않는다. "로그인 시 테마 적용"은 서버 보관이 전제이므로 User에 컬럼을 추가한다.

## 목표 / 비목표

- 목표: User에 `avatar_emoji`·`theme` 컬럼 추가(마이그레이션 0003), `PATCH /api/v1/auth/me`로 `display_name`/`avatar_emoji`/`theme` 부분 업데이트, `/me` 응답에 두 필드 추가. web: 프로필 폼이 `/me`에서 초기값을 읽고 저장 버튼으로 `authApi.updateProfile` 호출, 테마는 선택 즉시 적용 + 서버 저장, 로그인/세션 복원 시 `user.theme`를 적용(서버 우선).
- 비목표:
  - `qualityTier`(ADR-0004 LLM 품질 티어) 영속 — 별개 후속.
  - `provider`(가입 경로)는 인증에서 파생, 사용자 편집 대상 아님.
  - 테마 토큰/디자인 변경(기존 light/dark 팔레트 그대로 — `design.md`/globals.css 불변).
  - 프로필 이미지 업로드(아바타는 이모지 문자열만).
  - 별도 user_preferences 테이블(컬럼 2개면 충분 — YAGNI).

## 진실의 출처

- Glossary terms: 없음 — theme/avatar/profile-settings는 UI 구현이라 CONTEXT.md 미기재.
- Related ADRs:
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0007-frontend-session-token-handling.md` — 세션 복원(`/me`) 흐름에 테마 적용을 얹는다.
  - `.forge/adr/0004-user-llm-setting-as-quality-tier.md` — 사용자별 설정 영속의 선례(품질 티어); 본 작업은 그 옆에 profile/theme를 추가.
- 코드 사실(확인됨): User 컬럼 = id·email·display_name·hashed_password·is_verified·is_active·created_at·updated_at (theme·avatar 없음). alembic 2개(0001 auth, 0002 works) → 다음 0003. `UserResponse`에 display_name 있음, avatar_emoji·theme 없음. web: `settings.store`(mock, profile{displayName,avatarEmoji,provider}), `useTheme`(localStorage 'theme', `.dark` 토글, `system`은 matchMedia). 세션 복원은 `SessionRestore`(`__root.tsx`)가 `authApi.me()`→setUser. `PATCH /me` 갱신은 quick 수정으로 프록시/baseURL 이미 정상.
- Definition of Done: 로그인한 사용자가 계정 화면에서 표시이름·아바타를 저장하면 서버에 남고 새로고침/재로그인 후에도 유지된다. 테마를 바꾸면 즉시 적용+서버 저장되고, **로그아웃 후 다시 로그인하면 저장된 테마가 적용**된다. api `task lint`/`task test`, web `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. 마이그레이션 + 모델 — completion criterion: User 모델에 `avatar_emoji`(String, nullable)·`theme`(String(16), server_default `'system'`, not null) 추가, `alembic revision --autogenerate`로 0003 생성 후 **SQL 리뷰**(api/CLAUDE.md 규칙), `task migrate`로 up 적용 확인. down도 두 컬럼 drop.
- [ ] S2. PATCH /me 엔드포인트 + /me 확장 (TDD) — completion criterion: `UpdateProfileRequest`(display_name?/avatar_emoji?/theme? 전부 선택, theme는 'light'|'dark'|'system' 검증, display_name은 signup normalize 재사용) + `service.update_profile(user, patch)`(주어진 필드만 갱신) + 라우터 `PATCH /api/v1/auth/me`(`get_current_user`) + `UserResponse`에 avatar_emoji·theme 추가. pytest(fake): 부분 업데이트 반영, 잘못된 theme 거부, 미지정 필드 불변.
- [ ] S3. 계약 갱신 + facade — completion criterion: `task contract`로 SDK 재생성(PATCH /me + UserResponse 확장 반영), `auth.api.ts`에 `authApi.updateProfile` 추가. `task web:typecheck` 통과.
- [ ] S4. 프로필 저장 배선 (TDD) — completion criterion: `account-screen` ProfileSection이 폼 초기값을 `/me`(user: display_name·avatar_emoji)에서 읽고, 저장 시 `authApi.updateProfile({ display_name, avatar_emoji })` 호출 + 성공 토스트 + 로컬 사용자 상태 갱신(setUser). mock `settings.store`의 profile 저장 경로를 API로 대체(또는 user에서 읽기). RTL: 저장 시 updateProfile 호출·성공 처리.
- [ ] S5. 테마 저장 + 로그인 적용 (TDD) — completion criterion: `useTheme`에서 `applyTheme(theme)`(localStorage + `.dark` 토글)를 추출해 공유. ThemeSection의 setTheme가 즉시 적용 + `authApi.updateProfile({ theme })`로 서버 저장(persist-on-select). 로그인/세션 복원(`SessionRestore` 또는 login 성공 경로)에서 `user.theme`가 있으면 `applyTheme(user.theme)`로 적용(서버 우선). RTL/로직 테스트: 테마 선택 시 서버 저장 호출 + user.theme 적용.
- [ ] S6. 검증 — completion criterion: api `task lint`+`task test`, web `task web:check`+`pnpm test` 통과(신규 테스트 포함). playwriter로 프로필 저장→새로고침 유지, 테마 변경→저장, 로그아웃→재로그인 시 저장 테마 적용 UAT(백엔드 가동 시). 불일치는 `run.md` 기록. (depends: S1–S5)

(pre-existing repo 게이트 실패[test_auth_flows 린트·stale Makefile 테스트]는 이 작업과 무관 — 신규 실패만 본다. 마이그레이션은 리뷰 후 커밋 원칙 준수.)
