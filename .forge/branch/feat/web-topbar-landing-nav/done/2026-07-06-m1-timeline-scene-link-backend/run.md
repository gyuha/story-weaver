# RUN — M1: 타임라인 상태 + 씬-엔티티 링크 백엔드

slug: m1-timeline-scene-link-backend · task: 31 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입): Schema(S1) → CRUD 병렬(S2 씬-엔티티 링크·S3 타임라인 상태, 둘 다 신규 `timeline` 도메인 파일을 동시에 편집) → Verify(S4). 계약 재생성·웹 검증은 직접 수행.

## 계획대로 된 것

- **S1**: 신규 `timeline` 도메인(엔티티도 씬도 아닌 둘 다를 참조해 독립 도메인으로 결정) — `TimelineState`/`SceneEntityLink` 모델 + 마이그레이션 `0006_timeline_states_links`(UNIQUE(scene_id,entity_id) 포함).
- **S2**: 씬-엔티티 링크 CRUD, 중복 생성 시 409 대신 기존 행 반환(idempotent).
- **S3**: 타임라인 상태 CRUD + `up_to_scene_id` 시점 필터(스포일러 방지) — manuscript 도메인에 `list_scene_ids_up_to` 헬퍼를 추가해 크로스 도메인 ORM import 없이 해결. **핵심 테스트**(미래 시점 상태가 과거 조회에 새지 않음) 통과.
- **S4**: cross-tenant 커버리지 갭 없음 확인(S2/S3가 이미 5개 엔드포인트 전부 실DB 격리 테스트 작성).
- **직접**: `task contract` 재추출 — `timeline-states`/`links` 3개 경로 확인, 웹 typecheck/lint/test 회귀 없음.

## 계획 대비 차이 (divergences)

1. **S2·S3가 같은 신규 도메인 파일(`timeline_service.py`/`timeline_router.py`/`timeline_repository.py`)을 동시에 편집하며 충돌** — 계획서에 명시하지 않았던 위험(병렬 슬라이스가 겹치는 파일을 만들 가능성). 두 에이전트가 서로의 변경을 감지해 클로버 대신 병합(중복 헬퍼 제거, 라우터는 `router`/`links_router` 두 인스턴스로 분리 — FastAPI가 다른 path param 모양을 한 prefix에 못 묶어서). 직접 코드 리뷰로 잔여 중복·누락 없음 확인. **후속 교훈**: 같은 신규 도메인을 만드는 슬라이스가 여러 개면 파일 단위로 먼저 스캐폴딩(S1에 포함)하거나 순차 실행을 고려.
2. **timeline_states는 `updated_at` 없음** — data-model.md 4장이 "불변 사실의 누적"이라 명시해 append-only로 구현(계획서엔 명시 안 됐지만 문서와 일치하는 자연스러운 선택).

## 검증 (UAT)

- api: `task lint`(신규 코드 0 에러, 기존 test_auth_flows.py 7건만 무관) / `task test`(725 passed, 1 skipped, 12 failed 전부 무관 baseline). 마이그레이션 SQL 직접 리뷰 — FK cascade·UNIQUE·인덱스 정확.
- timeline_service.py/timeline_router.py 병합 결과 직접 리뷰 — 중복/누락 없음, 소유권 체크(worldbible+manuscript 양쪽 재사용) 정확.
- 계약: `task contract` → 3개 경로 확인. web: typecheck/lint/test(45) 통과.
- DoD 충족: 씬에 엔티티 수동 연결/해제 가능, 엔티티에 시점별 상태 기록·조회(현재 시점 이하만) 가능.

## M1 백엔드 완료

task 29(계층)·30(엔티티)·31(타임라인·링크)로 M1 백엔드(data-model.md 2~5장) 전체 완성. Stop-condition C1 재확인 필요(다음 단계에서 전체 pytest로 검증).
