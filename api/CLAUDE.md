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
