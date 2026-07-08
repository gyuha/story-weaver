# RUN — M2: 웹 — 메모리 사이드바 실 API 연동

slug: m2-web-memory-wiring · task: 35 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

작은 규모(파사드+배선)라 워크플로우 1단계로 처리(eco: sonnet, web-feature-builder 위임).

## 계획대로 된 것

- `memory.api.ts` facade(읽기 전용, mutations 없음). `handleRecommend`가 `MOCK_SCORES` 대신 실 API 호출.
- 백엔드의 `type=entity/timeline_state`(1차)→기존 미사용이던 `MemoryReason='link'` 타입 재활용, `type=vector_match`(보조)→`'vector'`로 매핑 — 새 스킴 발명 대신 이미 있던 타입 시스템 재사용.
- ChatTab/MOCK_REPLY 무변경(명시적 비목표).

## 계획 대비 차이 (divergences)

1. **로딩 상태 추가** — 계획엔 명시 안 됐으나 테스트 가능한 로딩 상태가 필요해 `recommending` state로 버튼 비활성+라벨 전환 추가.
2. **`{entityId, score}[]`를 `{entityId, reason}[]`로 교체** — 백엔드가 숫자 점수를 반환하지 않아 기존 점수 정렬 로직이 무의미해짐. 도착 순서(백엔드가 이미 우선순위 정렬)로 대체.
3. **playwriter MCP 미가용** — 이번 세션 중 연결이 끊겨(다른 태스크에서도 동일 확인) 실 브라우저 시각 확인 대신 RTL(로딩/에러/성공/배지 매핑 4테스트)로 검증. 직접 `handleRecommend` 코드 리뷰로 로직 정확성 재확인.
4. 에이전트가 도구 결과에서 또 하네스 정상 리마인더(날짜 변경 알림)를 프롬프트 인젝션으로 오인 — 이번 세션 내내 확인된 동일 패턴이라 정상으로 판단, 별도 조치 없음.

## 검증 (UAT)

- web: `pnpm typecheck`(clean) · `pnpm lint`(171 files, 0 errors) · `pnpm test`(23 files / 96 tests pass).
- `handleRecommend` 실 구현 직접 리뷰 — API 호출·중복 제외·reason 매핑 정확.
- DoD 충족: 메모리 패널의 "AI 추천 받기"가 실 API(1차 링크+보조 벡터) 결과를 표시.

## M2 전체 완료

task 34(백엔드)·35(웹)로 M2(메모리) 완성. C3 통과, C4 재확인 필요(다음 단계).
