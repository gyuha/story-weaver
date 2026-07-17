---
author: gyuha
decided: 2026-07-16
---
# Scene 계층 제거 — 화(Chapter)를 집필·메모리·AI 생성의 최소 단위로

씬(Scene)은 UI에 노출되지 않은 채(사이드바 트리는 부→화까지만, 편집창은 화의 첫 씬만 열림) 아키텍처 전반의 시점·검색·생성·기록 단위로만 존재해 왔다. 사용자 대면 모델을 `작품 → 부 → 화` 로 단순화하기 위해 **Scene 계층을 제거하고, 화(Chapter)가 본문(`body`)을 직접 보유하는 최소 단위**가 된다. 부(Episode/Part) 계층은 그대로 유지한다. dev 데이터는 보존 가치가 없어 **파괴적 마이그레이션(리셋)** 으로 처리한다 — 다중 씬 병합·scene_id 재지정 같은 이관 로직을 두지 않는다.

이 결정은 **ADR-0002(하이브리드 메모리)를 개정한다**: 하이브리드 구조(정형 카드 + 벡터 + 명시적 링크) 자체는 유지하되, "씬-엔티티 링크"는 "화-엔티티 링크"로, "씬 단위 임베딩"은 "화 본문 청킹 임베딩"으로 바뀐다. 씬(짧음)→화(김)로 검색 단위가 거칠어져 메모리 검색 정밀도가 떨어지는 것을 막기 위해, 화 본문을 **문단 그룹핑(목표 ~800자)** 으로 청킹해 화당 여러 임베딩(`chunk_index 0..N-1`)을 만든다.

## Considered Options

- **Scene 유지 (현행)** — 비용 0이고 UI가 이미 씬을 숨겨 개념적 단순함을 공짜로 제공한다. 씬 단위 RAG 정밀도(제품 차별점)도 보전된다. 그러나 데이터 모델에 노출되지 않는 계층이 남는다.
- **프론트만 정리** — 백엔드 계약은 그대로 두고 web에서만 화 단위로 다룬다. 그러나 진짜 결합의 뿌리(백엔드 계약·DB)가 남아 "제거"가 되지 않는다.
- **Scene 전체 제거 (채택)** — 사용자가 원한 2단계(부→화) 모델을 실제로 달성한다. 대가로 breaking API 변경(scene-scoped → chapter-scoped 6묶음)·풀스택 대공사·메모리 검색 재설계(청킹)를 수용한다.

## Consequences

- 공개 API 6묶음(assist 5종·memory·links·extract-updates·update-suggestions)의 경로가 `/works/{work_id}/scenes/{scene_id}/...` → `/works/{work_id}/chapters/{chapter_id}/...` 로 바뀌는 **breaking change**. 계약 재수출(openapi.json) → web `pnpm generate` 재생성이 뒤따른다(ADR-0006 파이프라인).
- 작품 전역 시점 축 `global_seq`가 씬 → **화 단위**로 재정의된다. `up_to_scene_id` 쿼리(타임라인 상태·관계도)는 `up_to_chapter_id`로 바뀐다. 타임라인 상태·충돌·관계도의 시점 정밀도가 화 단위로 뭉툭해진다(수용).
- `scenes` 테이블 및 `scene_entity_links`/`timeline_states`/`update_suggestions`의 `scene_id` FK, 폴리모픽 `embeddings(source_type='scene')`가 모두 화 기준으로 재정의된다. `Chapter`에 `body`·`global_seq` 컬럼이 추가된다.
- CONTEXT.md의 씬·화·편집 모드·버전 기록 용어와 `docs/data-model.md`는 이 리팩터링이 실제로 랜딩된 뒤(fg-learn 회고 단계)에 정리한다 — 구현 중 80여 파일이 아직 Scene을 참조하는 동안 글로서리가 코드와 모순되지 않도록 하기 위함.
- 원래 요청이던 "화 요약 기능"은 이 리팩터링 이후로 미룬다(별도 그릴링).
