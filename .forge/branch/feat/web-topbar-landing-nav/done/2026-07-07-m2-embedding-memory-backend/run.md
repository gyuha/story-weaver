# RUN — M2: 임베딩 + 메모리 검색 백엔드

slug: m2-embedding-memory-backend · task: 34 · executed: 2026-07-06/07 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입): Schema(S1) → Embed 병렬(S2 임베딩 클라이언트·S3 인덱서) → Memory 병렬(S4 검색 API·S5 벡터 격리 테스트).

## 사전 인프라 조치 (드라이브 중 직접 처리)

- z.ai(GLM) 임베딩 미지원 확인 → **사용자 결정**: 로컬 `sentence-transformers`(`paraphrase-multilingual-MiniLM-L12-v2`, 384차원)로 전환, 계획서 갱신.
- Postgres 컨테이너를 `postgres:16-alpine` → `pgvector/pgvector:pg16`로 교체(데이터 볼륨 유지, 기존 테이블 전부 보존 확인 후 진행).

## 계획대로 된 것

- **S1**: 신규 `memory` 도메인, `Embedding` 모델(`vector(384)`), 마이그레이션 `0007_memory_embeddings`(`CREATE EXTENSION IF NOT EXISTS vector` 수기 추가).
- **S2**: `embedding_client.py` — `SentenceTransformer` 모델을 `lru_cache`로 1회 로드, `embed_text`/`embed_texts`.
- **S3**: 인덱서(`MemoryService.index_source`)를 엔티티/씬 생성·수정 서비스에 실제로 배선(계획의 문구 그대로 요구한 부분).
- **S4**: `GET .../scenes/{scene_id}/memory` — 1차(링크+시점 필터 상태, 기존 timeline/manuscript 헬퍼 재사용) + 보조(pgvector 코사인 ANN top-5, work_id 필터, 1차와 중복 제거 + 자기 자신 씬 제외).
- **S5**: 벡터 격리 — (1) 필터 없는 raw 쿼리가 실제로 타 테넌트 벡터를 반환함을 먼저 증명, (2) 의도적으로 유사도 높은 "누출 마커" 문구로 실 엔드포인트가 새지 않음을 확인(적대적 테스트).

## 계획 대비 차이 (divergences)

1. **실 버그 발견·수정(S3)**: 인덱서를 `update_entity`/`update_scene`에 배선하자 `MissingGreenlet` 크래시 발생 — 인덱서의 조회가 대기 중인 UPDATE를 조기 autoflush시켜 `onupdate=func.now()` 컬럼이 expire되고, 라우터의 응답 빌더가 동기 접근하며 충돌. `session.no_autoflush`로 조회를 감싸고 리포지토리의 명시적 `flush()`를 제거해 해결(엔티티/씬 자체의 flush 시점은 요청 커밋 시로 그대로 유지). 계획엔 없던 발견이나 실제 회귀를 막은 필수 수정.
2. **순환 임포트 회피(S4)**: `MemorySearchService`를 `memory_service.py`의 와일드카드 재수출에서 빼고 별도 서브모듈로 분리 — `WorldBibleService`/`ManuscriptService`가 이미 인덱싱용 `MemoryService`에 의존하는 상태라, 검색 오케스트레이션까지 같은 곳에 두면 순환 참조가 생김.
3. **동적 import로 슬라이스 간 경합 회피(S5)**: S4가 아직 랜딩 전일 때 시작해 `importlib.import_module`로 동적 로드 — S4 완료 후 재작업 없이 자연스럽게 그린으로 전환.

## 검증 (UAT)

- api: `task lint`(신규 코드 0 에러) / `task test`(742 passed, 1 skipped, 12 failed 전부 무관 baseline). `memory_repository.py`의 work_id 필터·no_autoflush 수정 직접 리뷰 확인.
- 계약: `task contract` → `/scenes/{scene_id}/memory` 확인. web: typecheck/lint/test(92) 회귀 없음.
- DoD 충족: 엔티티/씬 생성 시 임베딩 자동 생성, 씬 기준 메모리 검색이 링크+벡터 결과 병합 반환, 필터 누락 시 실패하는 격리 테스트로 검증 로직 자체의 유효성 증명.
