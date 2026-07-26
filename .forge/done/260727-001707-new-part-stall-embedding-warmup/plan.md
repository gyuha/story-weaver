<!-- forge-slug: new-part-stall-embedding-warmup -->
<!-- task: 59 -->
<!-- tdd: on -->
<!-- priority: high -->
# 새 부 생성이 처음에 멈추는 문제: 임베딩 모델 워밍업 + 빈 본문 임베딩 차단

## Goal / Non-goals
- Goal: `새 부`(및 `새 화`) 생성이 백엔드 재시작 직후에도 즉시 반응하게 만든다. 원인은 **프로세스 최초 임베딩 호출이 SentenceTransformer 모델을 동기 로드(측정 6.13s, 이벤트 루프 점유)**하는 것이며, 빈 본문 화조차 임베딩을 호출하는 번들 결함이 이를 새 부 경로로 끌어왔다. ① 빈 본문 임베딩 차단 ② 부팅 후 백그라운드 워밍업 ③ `to_thread` 오프로드 ④ 프론트 버튼 pending 표시로 해결한다.
- Non-goals: 본문·엔티티 저장의 임베딩을 백그라운드 큐로 분리하지 않음(인라인 유지 — 일관성 우선) · HF 오프라인 강제(`local_files_only`/`HF_HUB_OFFLINE`)·모델 프리페치 장치 없음 · 전역 상단 진행바 없음 · 낙관적 업데이트(스켈레톤 행) 없음 · 새 부의 2회 순차 요청을 단일 원자 엔드포인트로 합치지 않음 · 다른 화면의 IME/Enter 가드 작업(별건 백로그)

## Source of truth
- Glossary terms: 메모리 · 부(Part) · 화(=챕터) in `.forge/CONTEXT.md` (새 용어 없음 — 임베딩 워밍업은 구현 세부이므로 글로서리 갱신 없음)
- Related ADRs: `0002-hybrid-memory-architecture.md`(보조 벡터 검색이 이 임베딩을 소비) · `260716-17a-remove-scene-collapse-into-chapter.md`(화 본문 청킹 임베딩의 근거). **새 ADR 없음** — 워밍업·오프로드·번들 수정 모두 되돌리기 쉬워 ADR 게이트 미충족.
- 진단 근거(코드·측정으로 확인):
  - 체인: `work-tree.tsx:74` → `works.store.ts:258`(POST episodes) → `works.store.ts:262`→`:484`(POST chapters) → `manuscript_service.py:124 index_chapter(body="")` → `memory_service.py:36 _chunk_paragraphs("") → [""]` → `memory_service.py:63 embed_text("")` → `embedding_client.py:23 SentenceTransformer(...)`.
  - 측정(`api/.venv`, 캐시 warm): `import sentence_transformers` 2.73s(부팅 시) · 모델 로드 **6.13s**(온라인) / 0.86s(`HF_HUB_OFFLINE=1`) → 차이 ~5.3s는 이미 캐시된 모델의 HF Hub 메타데이터 왕복 · `encode()` 0.09s → 이후 0.02s.
  - `_get_model()`이 `lru_cache(maxsize=1)`이라 프로세스당 1회 비용. dev의 `uvicorn --reload`가 코드 저장마다 프로세스를 갈아 "처음"이 반복 재현된다.
  - `embed_text()`는 코루틴 안에서 동기 실행되어 **이벤트 루프 전체를 점유** → 같은 시점의 다른 요청도 함께 멈춰 앱 전체가 굳은 것처럼 보인다.
  - 같은 블로킹이 `memory_search_service.py:80`(메모리 패널 오픈)에도 있어 "처음 6초"의 또 다른 트리거다.
  - 2차 피해 ①: 빈 문자열 임베딩 행이 `memory_repository.py:108`의 top-5 ANN 후보에 들어가 `memory_search_service.py:89`가 `vector_match / content: ""`로 반환 → 메모리 패널의 5칸 중 1칸을 낭비한다.
  - 2차 피해 ②: 멈춘 줄 알고 버튼을 다시 누르면 `works.store.ts:257`의 `partCount`를 둘 다 같은 값으로 읽어 **동일 "제N부" 에피소드가 2개** 생긴다(트리에서는 병합돼 보임).
- 결정 요약(그릴링 합의):
  - 수정 범위 = 번들·워밍·오프로드 + 버튼 스피너 4종 전부.
  - 워밍업은 **부팅 후 백그라운드**(`lifespan`에서 `create_task(to_thread(...))`) — 부팅 지연 0으로 dev 리로드 경험 유지. 동시 로드 방지 `Lock` 포함. HF 오프라인 강제는 하지 않음(백그라운드라 체감 0, 새 환경 부팅이 깨질 위험만 남음).
  - 빈 본문 가드는 `_chunk_paragraphs`에서 처리(빈/공백 본문 → `[]`). 그래야 `index_chapter`의 `delete_chunks_from(..., 0)`이 "본문을 전부 지운 화"의 잔존 청크까지 자동 정리한다.
  - 기존 `content = ''` 행은 Alembic 데이터 마이그레이션으로 1회 정리(down은 no-op).
  - 진행 표시는 **버튼 자체 pending**(disabled + 회전 아이콘). 진짜 프로그래스바는 진행률 이벤트가 없어 원리적으로 불가능하며, 수정 후 실제 소요는 왕복 2회 ≈ 100~200ms라 대개 보이지도 않는다. `disabled`가 위 2차 피해 ②를 함께 막는다.
  - `tests/memory/test_memory_service.py:104,133`이 `memory_service_module.embed_text`를 monkeypatch하므로 async 래퍼 도입 시 패치 대상 이름을 갱신한다. `tests/memory/test_embedding_client.py`의 `embed_text("")` 계약(384차원 반환)은 그대로 유지 — 걸러내는 곳은 청킹 단계다.
- Definition of Done:
  - 백엔드 재시작 직후 `새 부` 클릭 → **1초 내** 트리에 새 부가 나타난다(브라우저 육안).
  - 재시작 직후 메모리 패널 첫 오픈도 지연 없이 뜬다(브라우저 육안).
  - 새 화/새 부 생성 후 `embeddings`에 새 행이 생기지 않는다(SQL 확인).
  - `SELECT count(*) FROM embeddings WHERE content = ''` → 0.
  - 요청 중 버튼이 비활성·스피너로 바뀌고, 연타해도 부가 하나만 생긴다(브라우저 육안).
  - api `task lint`(ruff+mypy strict) · `task test` green, web `pnpm typecheck`·`pnpm lint`·`pnpm test` green.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 빈 본문 임베딩 차단 — `memory_service.py`의 `_chunk_paragraphs`가 공백만 있는 본문에 `[]`를 반환하도록 수정(현재는 `[body]` = `[""]`). `index_chapter`는 그대로 두면 `rows=[]` + `delete_chunks_from(..., 0)`으로 잔존 청크까지 정리된다. — completion criterion: pytest — ① `_chunk_paragraphs("") == []`·`_chunk_paragraphs("  \n\n ") == []`, ② 정상 본문의 기존 청킹 결과 불변(기존 테스트 유지), ③ `index_chapter(body="")`가 embed를 0회 호출하고 기존 청크를 전부 삭제한다. (depends: none)
- [ ] S2. 임베딩 비블로킹화 + 부팅 워밍업 — `embedding_client.py`에 `async def aembed_text`(`asyncio.to_thread`) 추가하고 `_get_model`에 `threading.Lock`으로 동시 로드 방지. 호출부 2곳(`memory_service.py:63 index_source`, `memory_search_service.py:80 search`)을 async 래퍼로 교체. `main.py`의 `lifespan`에 Redis 워밍업과 같은 자리로 `asyncio.create_task(asyncio.to_thread(_get_model))` 추가(시작·완료·실패를 structlog로 1줄씩, 실패해도 부팅은 계속). `tests/memory/test_memory_service.py`의 monkeypatch 대상 이름 갱신. — completion criterion: pytest — ① `index_source`가 async 래퍼를 통해 임베딩한다(fake로 호출 횟수 검증, 기존 캐싱 테스트 2건 green 유지), ② `_get_model`을 여러 스레드에서 동시 호출해도 `SentenceTransformer` 생성자가 1회만 불린다(monkeypatch), ③ `task lint` green. 서버 기동 로그에 워밍업 완료 라인이 찍힌다(육안). (depends: S1 — 같은 `memory_service.py`를 편집하므로 순차 진행)
- [ ] S3. 잔존 빈 임베딩 정리 마이그레이션 — Alembic 데이터 마이그레이션 1건: `DELETE FROM embeddings WHERE content = ''`, downgrade는 no-op(주석으로 명시). autogenerate가 아니라 손으로 쓴 SQL이므로 리뷰 후 커밋. — completion criterion: `task migrate` 성공 후 dev DB에서 `SELECT count(*) FROM embeddings WHERE content = ''` → 0. (depends: none)
- [ ] S4. 새 부/새 화 버튼 pending — `components/layout/work-tree.tsx`의 `handleAddPart`·`handleAddChapter`에 진행 상태를 두고, 진행 중 해당 버튼을 `disabled` + 아이콘을 `Loader2`(`animate-spin`)로 교체. 실패 시 상태를 풀고 기존 토스트는 유지. — completion criterion: RTL 테스트 — ① 요청 진행 중 버튼이 `disabled`이고 스피너가 보인다(pending promise로 고정), ② 진행 중 재클릭해도 `addPart`가 1회만 호출된다, ③ 실패 시 버튼이 다시 활성화되고 토스트가 뜬다. `pnpm typecheck`·`pnpm lint`·`pnpm test` green. (depends: none — web/ 만 편집하므로 백엔드 슬라이스와 병렬 가능)

## 검증 노트 (직전 회고 반영)
- **테스트 green을 검증 증거로 쓰지 않는다.** 워밍업이 실제로 6초를 부팅으로 옮겼는지, `to_thread`가 이벤트 루프를 반환하는지는 자동 테스트로 고정할 수 없다 → **백엔드 재시작 직후 브라우저에서 새 부 클릭·메모리 패널 오픈**을 UAT 필수 게이트로 둔다.
- 병렬 실행 시 저장소 전체 `typecheck`/`lint`를 각 슬라이스에서 돌리지 않는다(남의 진행 중 편집으로 오탐). 전체 검증은 통합 단계에 모은다.
