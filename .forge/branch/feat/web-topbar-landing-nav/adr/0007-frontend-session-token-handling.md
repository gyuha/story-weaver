# 프론트엔드 세션·토큰 처리 — localStorage 보관 + 반응형 401 단일 refresh

백엔드 `/auth/login`·`/auth/refresh`가 JWT access·refresh 토큰을 **응답 body**(`TokenResponse`, Set-Cookie 아님)로 내려주므로 web이 토큰을 직접 보관해야 한다. MVP 단계에서 access·refresh 토큰을 모두 **localStorage**에 저장하고, 요청 인터셉터가 access를 `Authorization: Bearer`로 주입하며, 401 응답 시 refresh 토큰으로 **단일(single-flight) 재발급** 후 큐된 요청을 재시도한다(재발급 실패 → 세션 비우고 로그인 리다이렉트). 앱 로드 시 access 토큰이 있으면 `/auth/me`로 세션을 복원한다.

## Considered Options

- **localStorage 둘 다 (채택)** — 새로고침 생존, 구현 단순, 기존 auth store가 이미 localStorage persist를 씀. 대가: XSS에 토큰 노출.
- **access in-memory + refresh localStorage** — access 노출은 줄지만 새로고침마다 refresh 왕복 + 복잡도 증가. refresh 토큰은 여전히 localStorage(XSS)라 보안 이득이 제한적.
- **httpOnly 쿠키** — XSS에 가장 강하나 백엔드가 Set-Cookie로 전환해야 함(현재 body 반환). part 1(web-only) 범위 밖.

## Consequences

- **XSS 위험 감수(MVP 결정).** 토큰이 JS로 읽히므로 XSS 시 탈취 가능. 업그레이드 경로는 백엔드 httpOnly 쿠키 발급 + web 토큰 보관 제거다. 보안을 강화할 때 이 ADR을 supersede한다.
- 401 재발급은 **반응형**(만료 선제 갱신 아님) + **단일 비행**(동시 401에 refresh 1회만 호출, 나머지는 큐 후 재시도). 이 로직이 wiring part 1의 핵심 테스트 대상이다.
- refresh 자체가 401/실패면 세션을 비우고 로그인으로 보낸다(무한 루프 방지).
- 백엔드 `/me`(`UserResponse`)에는 `role`·계정 승인 상태가 노출되지 않는다 — 관리자 게이팅은 후속 admin 도메인 작업에서 이 노출과 함께 설계한다(ADR-0005 참조).
