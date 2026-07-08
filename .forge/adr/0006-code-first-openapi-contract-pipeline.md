# API 계약 = code-first FastAPI → openapi.json → 프론트 타입 생성

프론트 `web/src/api`는 `pnpm generate`(openapi-ts)가 openapi 스펙에서 생성한 타입·SDK·Query 훅이다. 그러나 그 소스 스펙 파일이 저장소에 존재하지 않아(`web/openapi-ts.config.ts`의 input `./docs/openapi.json` = `web/docs/openapi.json` 부재, 루트 CLAUDE.md는 `docs/openapi.json`로 적어 경로도 불일치) **재생성이 불가능한 상태**다. 백엔드 도메인 API를 만들기 시작하는 지금, 프론트가 "목업에 맞게" 백엔드와 만나는 계약의 단일 출처와 동기화 방식을 확정해야 한다.

## Considered Options

- **code-first (채택)** — FastAPI Pydantic 스키마가 계약의 단일 출처. FastAPI가 런타임에 내는 `/openapi.json`을 스크립트로 정해진 경로에 덤프하고, 프론트가 `pnpm generate`로 소비한다. 백엔드가 진실, 프론트 타입은 파생물.
- **spec-first** — openapi 스펙을 손으로 작성·유지하고 백/프론트가 거기 맞춘다. FastAPI를 쓰는 한 스키마가 두 곳(코드·스펙)에 생겨 드리프트·중복이 불가피하다.

## Consequences

- openapi 익스포트 스크립트(`task openapi:export` 류)를 api에 둔다 — FastAPI 앱의 `/openapi.json`을 파일로 덤프.
- 덤프 경로를 **루트 `docs/openapi.json`로 통일**하고, web `openapi-ts.config.ts`의 input을 `../docs/openapi.json`으로 바꾼다(api가 web/ 내부에 쓰지 않도록, 공유 `docs/`에 계약을 둔다). 루트 CLAUDE.md의 경로 기술과도 일치시킨다.
- 계약 갱신 흐름: 백엔드 스키마 변경 → 익스포트 → `pnpm generate` → 프론트 타입 갱신. 이 루프를 works 도메인(첫 도메인)에서 1회 돌려 템플릿으로 확립한다.
- `docs/openapi.json`은 생성물이지만 계약 추적을 위해 커밋한다(프론트 `src/api`가 이미 커밋돼 있는 것과 동일 선상).
- 프론트의 실제 API 배선(mock-store → Query 훅 교체)은 이 ADR의 범위가 아니다 — 계약 생성 파이프라인만 확정한다. 배선은 별도 단계(인증 배선 선행).
