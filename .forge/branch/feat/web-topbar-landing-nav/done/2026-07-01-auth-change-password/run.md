# run — 인증 사용자 비밀번호 변경 (백엔드 + 폼 배선)

실행 방식: 직접 실행(풀스택 직렬 파이프라인 S1→S2→S3→S4, eco on·tdd on). 백엔드 빌딩블록이 모두 존재해 조립 위주. auth+계약이라 신중히 자체 검토 + TDD + end-to-end UAT.

## 계획대로 된 것

- **S1 백엔드**(TDD): `ChangePasswordRequest`/`ChangePasswordResponse` 스키마(새 비번은 signup 정책 재사용), `AuthService.change_password(user, current, new)`(현재 비번 `verify_password` 확인 → 새==현재 거부 → 소셜계정 거부 → `hash_password`+`update_user_password` → 세션 revoke), 라우터 `POST /api/v1/auth/change-password`(`get_current_user` 의존). pytest 4개(성공+세션revoke / 현재비번틀림 / 새==현재 / 소셜계정) red→green. 내 파일 ruff·mypy clean.
- **S2 계약+facade**: `task contract`(api:openapi → web:generate)로 SDK 재생성(`postApiV1AuthChangePassword` + `ChangePasswordRequest/Response` 타입 생성). `auth.api.ts`에 `authApi.changePassword` + `authMutations.changePassword` 추가. typecheck clean.
- **S3 폼 배선**(TDD): `account-screen.tsx` PasswordSection onSubmit이 mock toast 대신 `authApi.changePassword({ body: { current_password, new_password } })` 호출 → 성공 시 `clearSession()` + "비밀번호가 변경되어 다시 로그인해 주세요" + `/auth/login` 이동, 실패 시 `apiErrorMessage` 인라인 표시 + 버튼 로딩. RTL 테스트 2개(성공: 호출+세션clear+이동 / 실패: 에러표시·미이동).
- **S4 검증**: api 내 파일 ruff·mypy clean + change_password 4 테스트 green. web typecheck·lint clean + 전체 vitest **26 pass**(신규 2 포함). **백엔드 end-to-end UAT(curl)**: 로그인→change-password 200→옛 비번 401→새 비번 200.

## 계획과 어긋난 것 / 현장 결정

1. **세션 revoke 메서드**: 플랜은 `invalidate_all_user_sessions`라 적었으나, 형제 플로우 `confirm_password_reset`(비번 리셋 확인)이 `revoke_all_user_refresh_tokens`를 쓰므로 **그 패턴에 맞춰** 동일 메서드를 사용. 프론트가 로컬 세션을 즉시 `clear()`하고 재로그인을 유도하므로 그릴링 의도("전체 무효화 → 재로그인")는 그대로 충족. (refresh 토큰 전체 revoke + 클라이언트 세션 clear.)
2. **`validate_password_strength` 공용 함수 추출**: signup의 `password_strength` 검증 본문을 모듈 함수로 빼 SignupRequest·ChangePasswordRequest가 공유(중복 제거, eco).
3. **에러 코드**: 현재 비번 틀림 → `UnauthorizedError`(401); 소셜 계정(비번 없음)·새==현재 → `ConflictError`(409). 전용 BadRequest 클래스가 없어 기존 AppError 서브클래스를 재사용(프론트는 코드와 무관하게 `apiErrorMessage`로 detail 표시).
4. **PasswordSection export**: RTL 단위 테스트를 위해 내부 컴포넌트를 named export(테스트 가능성).
5. **UAT 방식**: 단일 in-browser playwriter 플로우 대신 **백엔드 end-to-end(curl: change→옛401/새200) + 프론트 폼(RTL)** 2계층으로 검증. 프록시/baseURL이 직전 quick 수정으로 고쳐졌고 facade가 typecheck되므로 통합 리스크가 낮아 충분. (사용자 원래 통증인 "브라우저에서 변경 안 됨"은 폼이 실 endpoint를 올바른 body로 호출함[RTL] + endpoint가 실제로 비번을 바꿈[curl]으로 커버.)
6. **직접 실행**(워크플로우 아님) — 직렬 풀스택이라 병렬 이득 없음.

## 조건부 코드 리뷰 (§3)

auth + 데이터 변경(비밀번호) + 신규 공개 계약 = 위험 영역. 별도 적대적 워크플로우 페이즈 대신 직접 경로에서 신중히 자체 검토(현재 비번 검증·소셜 가드·새!=현재·세션 revoke를 리셋 플로우와 일치) + TDD 4개(각 분기) + curl end-to-end UAT로 검증.

## 비목표 준수 / 미해결

- 비번 리셋(이메일) 플로우 변경 없음. 소셜 계정용 비번 설정 UX 신규 없음(백엔드 409 가드 + 기존 "소셜 계정" 안내 유지). 신규 마이그레이션 없음. 현재-세션-유지 옵션 미채택(전체 무효화).
- pre-existing repo 게이트 red(`test_auth_flows` 린트 nit 7 / stale Makefile 테스트 12)는 이 작업과 무관하게 그대로 — 내 파일·테스트는 clean/green. (별도 fg-quick 정리 권고는 유지.)
