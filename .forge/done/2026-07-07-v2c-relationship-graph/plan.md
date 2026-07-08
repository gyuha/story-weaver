<!-- forge-slug: v2c-relationship-graph -->
<!-- task: 44 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# v2-C — 캐릭터 관계도(기본 + 챕터별)

`roadmap.md` 4.3. M1의 인물 카드 `relations`(task 30) 데이터가 입력원. 챕터별(시점별) 관계도는 v2-B(타임라인 상태 규칙) 이후가 안전.

## 목표 / 비목표

- 목표: 인물 카드의 `relations`(방향성 관계 목록)를 시각화하는 기본 관계도 화면. 챕터별 관계도는 타임라인 상태(`state_key`로 관계 변화 표현, 예: `relation_to_<id>`)를 시점별로 조회해 AI가 요약 생성.
- 비목표: 관계 변화의 실시간 편집 UI(이 작업은 조회·시각화까지, 편집은 엔티티 카드 화면(M1 웹 연동)에서 이미 가능).

## 진실의 출처

- Glossary terms: 없음.
- 코드 사실: 인물 카드 `relations` 필드는 M1에서 이미 저장 가능(task 30) — 이 작업은 순수 시각화 추가.
- Definition of Done: 인물 카드들의 관계가 그래프로 보이고, 챕터를 선택하면 그 시점까지의 관계로 그래프가 바뀐다. `task lint`/`task test`, `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. 기본 관계도 API+화면 (TDD) — completion criterion: `GET .../works/{work_id}/relationships`(모든 인물의 relations 그래프 데이터) + 웹 시각화 컴포넌트(신규 라이브러리 도입은 최소화 — 이미 설치된 것으로 가능하면 그것 사용, 필요 시 가벼운 그래프 렌더러 1개 추가). pytest+RTL.
- [ ] S2. 챕터별(시점별) 관계도 (TDD) — completion criterion: `state_key=relation_to_*` 패턴으로 타임라인 상태에 관계 변화 기록 가능하게 하고, 특정 챕터 시점까지의 관계 그래프를 저비용 모델로 요약. pytest.
- [ ] S3. 검증 — completion criterion: api/web 게이트 통과. (depends: S1-S2)
