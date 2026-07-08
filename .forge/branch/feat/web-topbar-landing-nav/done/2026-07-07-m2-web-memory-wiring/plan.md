<!-- forge-slug: m2-web-memory-wiring -->
<!-- task: 35 -->
<!-- generated-by: fg-loop -->
<!-- tdd: on -->
# M2 — 웹: 메모리 사이드바 실 API 연동

`m2-embedding-memory-backend`(task 34)의 메모리 검색 API로 `memory-panel.tsx`를 전환.

## 목표 / 비목표

- 목표: 메모리 사이드바가 `MOCK_SCORES`/고정 추천 대신 실 메모리 검색 API(1차 링크+보조 벡터) 결과를 표시. "AI 추천 받기"가 실 API 호출로 대체.
- 비목표: 채팅 탭(`ChatTab`, `MOCK_REPLY`)의 실 연동 — 이건 일반 대화 기능이라 `chat` 도메인과 관련될 수 있으나 이 작업(메모리 사이드바)의 핵심 가치가 아니므로 비목표로 명시하고 별도 후속 검토(또는 v2 범위 후보로 retro에 기록).

## 진실의 출처

- Glossary terms: 메모리 — `.forge/CONTEXT.md`.
- 코드 사실: `memory-panel.tsx`의 `MOCK_SCORES`(163줄 부근)·`handleRecommend`가 로컬 고정값(탐색 확인).
- Definition of Done: 씬을 열면 메모리 패널이 실 API의 1차/보조 결과를 보여준다. `task web:check`/`pnpm test` 통과.

## 작업 조각

- [ ] S1. API 파사드 + Query 훅 (TDD) — completion criterion: `task contract` 재생성 후 메모리 검색 facade+Query 훅 추가.
- [ ] S2. 메모리 패널 배선 (TDD) — completion criterion: `handleRecommend`/자동 표시 로직이 실 API 호출, 1차/보조 결과 구분 표시(기존 UI 유지). RTL(로딩/에러/결과 상태).
- [ ] S3. 검증 — completion criterion: `task web:check`/`pnpm test` 통과, playwriter로 씬-엔티티 링크 있는 씬을 열어 메모리 패널에 실제 반영 UAT. (depends: S1-S2)
