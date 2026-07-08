<!-- forge-slug: m4-moderation-handling -->
<!-- task: 40 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M4 — 전체이용가 모더레이션 완곡 처리

`ai-pipeline.md` 6장. M3(집필 보조, task 36)에 적용.

## 목표 / 비목표

- 목표: 선제 가드(입력이 명백히 19금 수위 요구 시 생성 전 완곡 안내로 차단) + API 거절 시 raw 에러 은닉하고 완곡 안내로 변환 + 완화 프롬프트 자동 재시도 1회 + 재시도 실패 시 순화 유도 안내. 제공사별 거절 신호를 정규화하는 어댑터.
- 비목표: 정교한 분류 모델 기반 선제 가드(키워드 기반으로 충분 — ai-pipeline.md 6.1 "미결정, 키워드/분류 모델" 중 가장 단순한 선택). 이미지 모더레이션(v2-D, task 45).

## 진실의 출처

- Glossary terms: 없음.
- Related ADRs: `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`.
- 코드 사실: 모더레이션 처리 코드 전무(탐색 확인).
- Definition of Done: 19금 수위 입력에 선제 가드가 완곡 안내를 반환하고, API 거절 시 시스템 오류 코드가 노출되지 않는다. `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. 선제 가드 (TDD) — completion criterion: 집필 보조 요청 입력에 키워드 기반 19금 판정 함수 + 감지 시 완곡 안내 반환(생성 호출 안 함). pytest.
- [ ] S2. 거절 정규화 + 완화 재시도 (TDD) — completion criterion: LLM 호출 결과가 거절/빈 응답이면 완화 프롬프트로 1회 자동 재시도, 실패 시 완곡 안내(재시도 버튼 유도 문구). pytest(fake LLM으로 거절 시뮬레이션).
- [ ] S3. 검증 — completion criterion: `task lint`/`task test` 통과. (depends: S1-S2)
