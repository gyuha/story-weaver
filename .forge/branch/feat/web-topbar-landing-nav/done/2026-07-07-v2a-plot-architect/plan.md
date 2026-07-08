<!-- forge-slug: v2a-plot-architect -->
<!-- task: 42 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# v2-A — Plot Architect(구조 트리뷰 + 비트 시트 생성)

`roadmap.md` 4.1. MVP(M0-M4)가 쌓은 계층(`order_index`/`global_seq`, task 29)과 모델 스위칭(task 36) 위에서 동작. M4까지 완료 후 착수 전제.

## 목표 / 비목표

- 목표: 부/챕터를 드래그 앤 드롭으로 순서 변경하는 트리뷰(웹) + 순서 변경 시 `order_index`/`global_seq` 재계산 API. "회귀물 1화 국룰 전개" 같은 비트 시트 자동 생성(고품질 모델 티어, task 36의 티어 라우팅 재사용).
- 비목표: 설정 충돌 감지(task 43)와의 통합 — 별개 기능.

## 진실의 출처

- Glossary terms: 없음.
- Related ADRs: 없음(신규 결정 시 이 작업에서 ADR 후보).
- 코드 사실: 현재 화면은 정적 목록(드래그 앤 드롭 없음), `global_seq` 재계산 로직도 task 29에서 단순 append만 구현(재계산 최적화는 여기서 필요해짐).
- Definition of Done: 부/챕터를 드래그로 재배열하면 순서가 서버에 반영되고 `global_seq`가 재계산된다. 비트 시트 생성 버튼이 실 LLM 결과를 반환한다. `task lint`/`task test`, `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. order_index 재계산 API (TDD, api) — completion criterion: `PATCH .../episodes/reorder`, `.../chapters/reorder` — 이동 후 순서 재부여 + 영향받는 씬들의 `global_seq` 재계산. pytest.
- [ ] S2. 트리뷰 DnD (TDD, web) — completion criterion: 부/챕터 트리에 드래그 앤 드롭 추가, 이동 시 S1 API 호출. RTL.
- [ ] S3. 비트 시트 생성 (TDD) — completion criterion: `POST .../beat-sheet`(고품질 티어) — 장르/키워드 기반 비트 시트 생성, 웹에 결과 표시 UI. pytest(fake+실 LLM 1건).
- [ ] S4. 검증 — completion criterion: api/web 게이트 통과, playwriter UAT. (depends: S1-S3)
