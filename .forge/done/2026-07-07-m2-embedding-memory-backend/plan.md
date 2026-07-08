<!-- forge-slug: m2-embedding-memory-backend -->
<!-- task: 34 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
# M2 — 임베딩 + 메모리 검색 백엔드

`data-model.md` 6장 + `ai-pipeline.md` 2장. M1(entities/scenes/scene_entity_links/timeline_states, task 29-31)이 만든 데이터 위에서 동작. ADR-0002 하이브리드 메모리(링크 1차 + 벡터 보조)의 핵심.

## 목표 / 비목표

- 목표: pgvector 확장 + `embeddings` 테이블(폴리모픽, source_type/source_id, work_id 격리). 엔티티 카드(summary+attributes)·씬 본문(body) 임베딩 인덱서(저장 시 트리거). 메모리 검색 API: 1차(scene_entity_links로 명시 엔티티+현재 시점까지 타임라인 상태) + 보조(벡터 ANN, work_id 선필터) → 병합·중복제거·우선순위화(P1~P4). 벡터 격리 테스트(work_id 필터 누락 시 타 테넌트 벡터 반환 확인 — 이게 빠지면 실패해야 하는 테스트).
- 비목표: 재임베딩 무효화 트리거의 정교한 최적화(엔티티/씬 수정 시 동기 재임베딩으로 충분, 비동기 큐는 M3 동적 업데이트 파이프라인(task 38)에서 필요해지면 도입). 토큰 예산 정밀 계산(작업별 정확한 배분 비율은 ai-pipeline.md 2.1 "미결정" — 이 작업은 합리적 기본값(top-K=5 등)으로 구조만 동작시킴). 프롬프트 조립(task 36).

## 진실의 출처

- Glossary terms: 메모리(Memory) — `.forge/CONTEXT.md`("RAG" 대신 "메모리" 용어 사용, 사용자 대면 문구에서만; 코드/API 식별자는 자유).
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md`.
- 코드 사실: `embeddings` 테이블·pgvector 없음(탐색 확인). `api/src/domains/chat/llm_client.py`/`llm_factory.py`의 LLM 프로바이더 추상화는 채팅용이나 임베딩 API 호출 레이어로 재사용 검토(임베딩은 별도 엔드포인트/모델이 필요 — litellm이 embedding도 지원하는지 확인 후 재사용 또는 신규 클라이언트).
- LLM 설정: `.env`의 `LLM_PROVIDER=openai_compatible`(z.ai GLM, `LLM_DEFAULT_MODEL=glm-4.6`)은 채팅 생성용. **임베딩은 z.ai가 지원하지 않음을 fg-loop 드라이브 중 직접 확인**(여러 표준 모델명으로 `/embeddings` 호출 시도 → 전부 "Unknown Model"). **인간 결정(2026-07-06): 로컬 임베딩 모델(sentence-transformers) 사용 — API 키 불필요.** 모델은 `paraphrase-multilingual-MiniLM-L12-v2`(다국어+한국어 지지, 384차원, 경량)로 확정 — S1의 `embedding vector(N)`은 N=384.
- Definition of Done: 엔티티/씬을 만들면 임베딩이 생성되고, 현재 씬 기준 메모리 검색이 링크 엔티티+벡터 유사 결과를 병합해 반환한다. 벡터 검색에 work_id 필터가 없으면 격리 테스트가 실패함을 먼저 확인(TDD red)한 뒤 필터를 넣어 통과(green). `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. pgvector + embeddings 마이그레이션 (TDD) — completion criterion: `CREATE EXTENSION IF NOT EXISTS vector`, `embeddings`(id, work_id, source_type enum(entity/scene), source_id, chunk_index, embedding vector(N), content, timestamps) alembic + SQL 리뷰. 임베딩 차원 N은 실제 사용할 임베딩 모델 출력 차원에 맞춰 이 작업에서 확정(미결정 항목 해소).
- [ ] S2. 임베딩 클라이언트 구현 — completion criterion: `sentence-transformers`를 `uv add`로 의존성 추가, `paraphrase-multilingual-MiniLM-L12-v2` 모델로 텍스트→384차원 벡터 변환하는 임베딩 클라이언트(동기 함수 호출, 모델은 프로세스 시작 시 1회 로드해 재사용 — 매 호출 로드 금지). LLM 채팅 프로바이더(chat 도메인)와는 무관한 별도 로컬 클라이언트.
- [ ] S3. 인덱서 (TDD) — completion criterion: 엔티티 생성/수정, 씬 본문 저장 시 해당 소스의 임베딩을 (재)생성하는 서비스 로직(간단한 동기 처리로 충분, 비목표 참고). 로컬 모델이라 API 키·비용 걱정 없이 pytest에서 실제 임베딩 호출로 검증(mock 불필요, 단 테스트 스위트 전체 속도를 위해 모델 로드는 세션 스코프 fixture로 1회만).
- [ ] S4. 메모리 검색 API (TDD) — completion criterion: `GET /api/v1/works/{work_id}/scenes/{scene_id}/memory` — 1차(scene_entity_links+timeline_states, global_seq 필터) + 보조(pgvector ANN top-K, work_id 필터) 병합·중복제거(링크 우선)·우선순위(P1~P4) 반환. pytest.
- [ ] S5. 벡터 격리 테스트 (TDD, 먼저 실패 확인) — completion criterion: work_id 필터를 임시로 제거한 쿼리로 테스트가 실패함을 확인(다른 테넌트 벡터가 새는지 검증하는 테스트 자체가 유효한지 증명) → 필터 추가 후 통과. (depends: S1-S4)
- [ ] S6. 검증 — completion criterion: `task lint`/`task test` 통과, `task contract`. (depends: S1-S5)
