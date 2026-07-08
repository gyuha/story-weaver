<!-- forge-slug: auth-change-password -->
<!-- task: 25 -->
<!-- tdd: on -->
<!-- priority: high -->
# 인증 사용자 비밀번호 변경 (백엔드 엔드포인트 + 폼 배선)

계정 화면(`/settings/account`)의 비밀번호 변경을 실제로 동작하게 만든다. 현재는 mock(`account-screen.tsx`의 onSubmit이 API 없이 `toast.success`만)이고, 백엔드에 **인증 사용자용 비밀번호 변경 엔드포인트가 없다**(password-reset[이메일]·password-reset/confirm[토큰]만 존재). 인증된 사용자가 **현재 비밀번호로 본인 확인 후 새 비밀번호로 변경**하는 엔드포인트를 신설하고, heyapi로 SDK를 갱신해 폼을 배선한다.

보안 결정(그릴링): **변경 성공 시 전체 세션을 무효화**하고 재로그인을 요구한다(`invalidate_all_user_sessions` 재사용 — 기존 JWT reuse-detection/blacklist 보안 모델의 연장). 프론트는 성공 시 세션을 비우고 안내 후 `/auth/login`으로 보낸다.

## 목표 / 비목표

- 목표: `POST /api/v1/auth/change-password`(인증 필요) 신설 — 현재 비번 검증 + 새 비번 정책 검증 + 해시 후 저장 + 전체 세션 무효화. heyapi 재생성(`task contract`)으로 SDK 갱신, `authApi`에 `changePassword` 추가, `account-screen` 폼을 실 호출로 배선(성공 시 세션 clear+재로그인 유도, 실패 시 백엔드 사유 표시).
- 비목표:
  - 비밀번호 **재설정**(이메일 링크) 플로우 변경 — 기존 `password-reset`/`confirm` 그대로.
  - 소셜(OAuth-only, `hashed_password` 없음) 계정용 비번 설정 UX 신규 — 백엔드는 400으로 막고, 화면은 기존처럼 "소셜 계정" 안내 유지.
  - 2FA·비번 강도 미터·재사용 이력 검사 등 부가 기능.
  - 현재 세션만 살리고 나머지만 무효화하는 선택적 처리(전체 무효화로 단순화).
  - 새 Alembic 마이그레이션(스키마 변경 없음 — `update_user_password`는 기존 컬럼).

## 진실의 출처

- Glossary terms: 없음 — "비밀번호 변경"은 구현이라 CONTEXT.md 미기재. ([[계정 승인]]·이메일 인증과 무관한 축.)
- Related ADRs:
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0007-frontend-session-token-handling.md` — 프론트 세션/토큰 처리(전체 무효화 후 재로그인 흐름이 여기 모델과 일관).
  - `.forge/branch/feat/web-topbar-landing-nav/adr/0005-users-as-tenant-app-layer-scoping.md` — 사용자 스코핑.
  - 세션 전체 무효화 결정은 신규 ADR 없이 이 플랜에 기록(기존 JWT reuse-detection/blacklist 보안 모델의 적용 — README "JWT 전략" 참조).
- 코드 사실(확인됨): `security.py` `verify_password`/`hash_password`(argon2). service `authenticate_credentials`. repo `update_user_password`·`revoke_all_user_refresh_tokens`·`invalidate_all_user_sessions` 존재. 비번 정책은 `auth_schemas.py:53`의 `@field_validator("password")`(대/소문자·숫자·특수·min 8) — 새 비번에 **재사용**. 미러: `confirm_password_reset`(service:399)의 hash→`update_user_password` 패턴. 라우터 인증은 `get_current_user` 의존성. 프론트 폼은 `account-screen.tsx`(RHF + `passwordSchema`: current/next/confirm + next==confirm refine), 에러 표시는 `features/auth/lib/api-error.ts`의 `apiErrorMessage` 재사용.
- Definition of Done: 인증된 사용자가 계정 화면에서 현재 비번+새 비번을 입력해 변경하면 (1) 잘못된 현재 비번은 거부(에러 표시), (2) 정책 위반 새 비번은 거부(사유 표시), (3) 성공 시 비번이 실제로 바뀌고 전체 세션이 무효화돼 재로그인이 필요하며 새 비번으로 로그인된다. api `task lint`/`task test`, web `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. 백엔드 change-password 엔드포인트 (TDD) — completion criterion: `ChangePasswordRequest`(current_password, new_password; new_password는 signup 비번 검증 로직 재사용 — 가능하면 공용 validator로 추출) + service `change_password(user, current_password, new_password)`(현재 비번 `verify_password`로 검증 실패 시 401/400, 새 비번==현재 거부, `hashed_password`가 없으면[소셜] 400, 통과 시 `update_user_password` + `invalidate_all_user_sessions`) + 라우터 `POST /api/v1/auth/change-password`(`get_current_user` 의존). pytest(fake)로 성공/현재비번틀림/새==현재/소셜계정/세션무효화호출을 test-first. `task lint`(ruff+mypy) 통과.
- [ ] S2. 계약 갱신 + facade — completion criterion: `task contract`(api:openapi → web:generate)로 SDK 재생성해 새 엔드포인트가 `web/src/api`에 생기고, `web/src/features/auth/api/auth.api.ts`의 `authApi`에 `changePassword`(직접 호출, throwOnError) + 필요 시 `authMutations.changePassword` 추가. `task web:typecheck` 통과.
- [ ] S3. account-screen 폼 배선 (TDD) — completion criterion: `account-screen.tsx` 비번 변경 onSubmit이 mock toast 대신 `authApi.changePassword({ body: { current_password: current, new_password: next } })` 호출. 성공 → 세션 clear(useAuthStore) + "비밀번호가 변경되어 다시 로그인해 주세요" 안내 + `/auth/login`으로 이동. 실패 → `apiErrorMessage`로 백엔드 사유 인라인 표시(현재 비번 틀림·정책 위반). RTL 테스트로 성공(호출+세션clear+이동)/실패(에러표시·미이동) 검증.
- [ ] S4. 검증 — completion criterion: api `task lint`+`task test`, web `task web:check`+`pnpm test` 통과(신규 테스트 포함). playwriter로 계정 화면에서 비번 변경 → 재로그인 유도 → 새 비번 로그인까지 UAT(가능 범위; 백엔드 가동 시). 불일치는 `run.md` 기록. (depends: S1–S3)

(전체 세션 무효화로 변경 후 재로그인 필요 — 이는 의도된 보안 동작이며 UAT에서 확인. pre-existing repo 게이트 실패[test_auth_flows 린트·stale Makefile 테스트]는 이 작업과 무관하니 신규 실패만 본다.)
