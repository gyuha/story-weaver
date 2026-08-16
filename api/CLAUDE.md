# StoryWeaver API — 개발 가이드

AI 웹소설 창작 SaaS "StoryWeaver"의 FastAPI 백엔드. 제품 설계 문서는 저장소 루트의 `docs/`(PRD·아키텍처·데이터모델·AI파이프라인·로드맵), 도메인 용어·결정은 루트 `.forge/`(CONTEXT.md·adr/) 참조.

## 스택

- Python ≥ 3.12, FastAPI, Uvicorn — 패키지 매니저는 **uv**
- PostgreSQL(asyncpg) + SQLAlchemy(async) + Alembic, Redis
- 인증: JWT(python-jose) + argon2 + OAuth(google/kakao/naver) + RBAC
- LLM: LangChain + langchain-litellm (provider 교체는 `LLM_PROVIDER` 환경변수만)
- 품질: ruff(린트+포맷), mypy(strict), pytest

## 구조 — Light Modular Monolith (DDD)

`src/`가 Python path 루트(PYTHONPATH=src). 각 도메인은 `src/domains/<bc>/` 아래 `router / service / repository / models / schemas`로 자기 완결적.

- `src/core/` — 횡단 관심사(config, database, redis, middleware, exceptions)
- `src/domains/auth/` — 인증·인가 (JWT + OAuth + RBAC)
- `src/domains/chat/` — LLM 프록시·SSE 스트리밍 (StoryWeaver 집필 LLM의 기반)
- `src/domains/shared/` — 도메인 공유 기반 코드
- `src/infra/` — 외부 시스템 어댑터

## 규칙

- **도메인 간 직접 DB 모델 import 금지** — 도메인 경계를 넘는 참조는 ID 또는 이벤트로.
- **src layout** 유지 — import는 `src` 기준.
- mypy strict·ruff 통과가 기본. 커밋 전 `task lint`.
- **Alembic 마이그레이션은 항상 리뷰 후 커밋** — autogenerate SQL을 검토할 것.
- **마이그레이션 왕복 테스트는 `"head"`로 복원하고 복원을 `finally`에 둔다.** 공유 dev DB에 실제 마이그레이션을 돌리는 테스트가 하드코딩된 리비전(`command.upgrade(cfg, "0005_entity_images")`)으로 복원하면, 다음 마이그레이션이 추가되는 순간 DB가 그 리비전에 갇혀 이후 모든 테스트가 무너진다. task 80에서 **16 failed · 150 errors**로 실측했고 원인을 `alembic current`로 특정했다. `downgrade`와 `upgrade` 사이에서 단정하는 형태도 같은 함정이다 — 단정이 실패하면 복원이 실행되지 않는다.
- **QA 계정에 `@*.test` 도메인을 쓰지 않는다.** pydantic `EmailStr`이 `.test`를 예약 TLD로 거부해 `/api/v1/auth/me`가 **500**을 내고 웹 로그인이 불가능하다(task 81 실측). `@example.com`을 쓴다.
- 비밀값은 `.env`(로컬)·`.env.prod`(운영)에. 절대 커밋 금지.

## 주요 명령어

```bash
task dev      # 풀 부트스트랩 (uv sync + infra + migrate + uvicorn)
task test     # pytest
task lint     # ruff check + mypy
task format   # ruff format + ruff check --fix
task migrate  # alembic upgrade head
```

상세는 `README.md` 참조.
