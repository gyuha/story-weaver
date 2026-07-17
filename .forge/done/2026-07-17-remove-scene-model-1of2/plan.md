<!-- forge-slug: remove-scene-model-1of2 -->
<!-- task: 56 -->
<!-- tdd: on -->
<!-- part: 1/2 -->
<!-- priority: high -->
# 백엔드에서 Scene 계층 제거 — 화(Chapter)를 본문 보유 최소 단위로

## Goal / Non-goals
- Goal: 백엔드(api/)에서 Scene 계층을 제거하고 화(Chapter)가 본문(`body`)을 직접 보유하는 최소 단위가 되게 한다. 파괴적 마이그레이션(scenes 테이블 제거·Chapter.body/global_seq 추가), scene-scoped 라우터/서비스/스키마를 chapter-scoped로, 링크·타임라인 상태·동적 제안·임베딩을 화 단위로 이관, 화 본문을 문단 그룹핑으로 청킹 인덱싱, 백엔드 테스트 green, `docs/openapi.json` 재수출.
- Non-goals:
  - web 변경 — 계약 재생성부터 UI까지 전부 part 2/2에서.
  - 데이터 보존 이관 — dev 데이터는 리셋(파괴적 마이그레이션), 다중 씬 병합·scene_id 재지정 로직 없음.
  - 부(Episode/Part) 계층 제거 — 유지.
  - 화 요약 기능(원래 요청) — 이 리팩터링 이후 별도 과제.

## Source of truth
- Glossary terms: 화(=챕터/Chapter)·씬(Scene)·부(Part/Episode)·메모리·타임라인 상태·버전 기록 — .forge/CONTEXT.md (씬 항목 정리는 완료 후 fg-learn에서)
- Related ADRs:
  - .forge/branch/feature-summary/adr/260716-17a-remove-scene-collapse-into-chapter.md (이 결정)
  - .forge/adr/0002-hybrid-memory-architecture.md (하이브리드 메모리 — 본 ADR이 개정: 씬→화 단위)
  - .forge/adr/0006-code-first-openapi-contract-pipeline.md (백엔드 스키마 → openapi.json → web SDK 파이프라인)
- Definition of Done: `scenes` 테이블과 `scene_id` 경로/참조가 백엔드에서 사라지고, assist 5종·memory·links·dynamic-update·manuscript 엔드포인트가 모두 chapter 스코프로 동작하며, 화 본문이 문단 그룹핑 청킹으로 임베딩돼 메모리 검색이 화 단위로 동작한다. ruff·mypy·pytest 통과, `docs/openapi.json` 재수출 완료.

## Work slices (TDD: 각 슬라이스는 실패하는 테스트를 먼저 작성)
- [ ] S1. 모델 + 파괴적 마이그레이션 — `Chapter`에 `body`(Text)·`global_seq` 컬럼 추가, `scenes` 테이블 제거. FK/enum을 화 기준으로 재정의: `scene_entity_links.scene_id`→`chapter_id`(+ `UNIQUE(chapter_id, entity_id)`), `timeline_states.scene_id`→`chapter_id`, `update_suggestions.scene_id`→`chapter_id`, `embeddings` enum `scene`→`chapter`. — 완료 기준: 깨끗한 DB에 alembic upgrade가 적용되고, 모델 테스트(FK·CASCADE·UNIQUE·global_seq)가 통과.
- [ ] S2. 화 본문 청킹 인덱싱 — 화 본문을 연속 문단을 ~800자까지 모으는 문단 그룹핑으로 청크 분할해 `chunk_index 0..N-1`로 임베딩. 화 생성/수정 시 재인덱싱(내용 불변이면 스킵). — 완료 기준: 서비스 단위 테스트에서 다문단(>800자) 본문이 여러 청크 임베딩으로, 단문은 청크 1개로 인덱싱된다. (depends: S1)
- [ ] S3. 메모리 검색 화 단위 재설계 — 쿼리(편집 중 화 본문)로 청크 벡터 ANN → 화로 되매핑·중복 제거, 화-엔티티 링크(1차) + 벡터(보조), 자기 화 제외. — 완료 기준: memory search route 테스트가 `chapter_id`로 200, 결과에서 자기 화 제외, 타 테넌트 접근 404. (depends: S1, S2)
- [ ] S4. manuscript 라우터·서비스 — `scenes` CRUD 제거, 화 CRUD(`PATCH .../episodes/{episode_id}/chapters/{chapter_id}`)에 `body` 반영. `get_scene_by_id`/`list_scene_ids_up_to`/`_recompute_global_seq`를 화 기준(`get_chapter_by_id`/`list_chapter_ids_up_to`/global_seq 화 단위)으로, export가 화 본문을 직접 사용. — 완료 기준: manuscript route 테스트가 화 본문 저장·조회·재정렬·export를 chapter 단위로 통과. (depends: S1)
- [ ] S5. 크로스 도메인 라우터 chapter 스코프화 — assist 5종·memory·links·dynamic-update 경로를 `/works/{work_id}/chapters/{chapter_id}/...`로, chat 본문의 `scene_id`와 conflicts/relationships/timeline의 `up_to_scene_id`를 `chapter_id`/`up_to_chapter_id`로. — 완료 기준: 해당 도메인 route 테스트가 전부 chapter 스코프로 통과(인증·크로스테넌트 404·모더레이션·rate limit·SSE `[DONE]` 유지). (depends: S1, S4)
- [ ] S6. 계약 재수출 + 전체 게이트 — 백엔드 `docs/openapi.json` 재수출. — 완료 기준: openapi.json에서 `scenes` 경로·`SceneResponse`가 사라지고 화 `body`·chapter-scoped 경로가 반영되며, ruff·mypy·pytest 전체 green. (depends: S3, S4, S5)
