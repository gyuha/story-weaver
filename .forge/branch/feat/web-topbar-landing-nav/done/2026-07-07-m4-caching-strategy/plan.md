<!-- forge-slug: m4-caching-strategy -->
<!-- task: 41 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M4 — 캐싱 전략(임베딩 캐싱 + 결정적 결과 캐싱)

`ai-pipeline.md` 5.3. M2(임베딩, task 34)·M3(교정 등, task 36)에 적용.

## 목표 / 비목표

- 목표: 임베딩 캐싱(엔티티/씬 미변경 시 재임베딩 안 함 — task 34의 인덱서에 변경 감지 조건 추가). 교정처럼 결정적인 작업의 단기 결과 캐싱(Redis, 입력 해시 키).
- 비목표: 프롬프트 프리픽스 캐싱(제공사 종속·미결정, z.ai 지원 여부 불확실 — 이 작업은 시도하지 않고 retro에 후속 후보로 기록). 창의 작업(이어쓰기·변환) 캐싱 — 설계상 캐시하지 않음이 명시된 비목표.

## 진실의 출처

- Glossary terms: 없음.
- 코드 사실: `core/redis.py`에 Redis 클라이언트 준비돼 있으나 캐싱 로직 없음(탐색 확인).
- Definition of Done: 엔티티/씬을 수정하지 않고 다시 저장해도 임베딩이 재생성되지 않는다(캐시 히트). 같은 교정 요청을 반복하면 캐시된 결과를 반환한다. `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. 임베딩 캐싱 (TDD) — completion criterion: task 34 인덱서에 콘텐츠 해시 비교 로직 추가 — 변경 없으면 재임베딩 스킵. pytest.
- [ ] S2. 결정적 결과 캐싱 (TDD) — completion criterion: 교정 엔드포인트(task 36) 응답을 입력 해시 키로 Redis에 단기 TTL 캐싱, 캐시 히트 시 LLM 미호출. pytest.
- [ ] S3. 검증 — completion criterion: `task lint`/`task test` 통과. (depends: S1-S2)
