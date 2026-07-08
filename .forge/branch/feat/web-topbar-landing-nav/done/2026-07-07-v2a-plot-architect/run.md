# RUN — v2-A: Plot Architect(트리뷰 DnD + 비트 시트 생성)

slug: v2a-plot-architect · task: 42 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

2개 Dynamic Workflow로 분리: 1) 백엔드(S1 재정렬 API + S3 비트 시트, 병렬) → 계약 재생성(직접) → 2) 웹(S2 트리 DnD + 비트 시트 UI). task 38/32의 계약 재생성 시퀀싱 실수를 이번엔 미리 방지.

## 계획대로 된 것

- **S1**: `PATCH .../episodes/reorder`, `PATCH .../chapters/reorder`(순서 배열) — order_index 재부여 + 전체 work의 global_seq 재계산(단순 전체 재계산, 저빈도 admin 액션이라 충분).
- **S3**: `POST /works/{work_id}/beat-sheet` — high_quality 티어, assist 라우터와 동일한 가드 구성(선제가드→budget→rate→모더레이션 재시도) 재사용.
- **S2**: 네이티브 HTML5 드래그앤드롭(라이브러리 미설치 확인 후 추가 안 함, YAGNI)으로 부/화 순서 변경, `비트 시트 생성` UI(시놉시스 페이지에 배치).

## 계획 대비 차이 (divergences)

1. **S1 중간보고의 "17개 실패" 관측은 S3와의 동시 편집 중 일시 상태** — S3 완료 후 재확인 시 12개(baseline)로 정상 복귀. 직접 전체 재실행으로 확인.
2. **에이전트가 무관한 기존 버그 발견(수정 안 함, 규칙대로)**: `hydrate-chapters.ts:48`의 `index: chapter.orderIndex`가 0-based 그대로 표시돼 새로고침 후 "0화"로 보이는 off-by-one — task 32/37 소관, 이번 작업과 무관해 손대지 않고 후속 후보로만 기록.
3. **드래그앤드롭 상태를 `dataTransfer` 대신 컴포넌트 클로저로 관리** — 같은 트리 내 이동만 다루므로(다른 창/컴포넌트로 드롭 없음) 더 단순한 선택.

## 검증 (UAT)

- api: 백엔드 파트 최종 재확인 — `task lint`(baseline만), `task test`(841 passed, 1 skipped, 12 failed 전부 무관).
- web: `pnpm typecheck`/`lint`(180 files)/`test`(132 tests) 전부 통과.
- **에이전트의 실 브라우저 검증(browse 스킬)**: 실제 dragstart/dragover/drop 이벤트로 화 순서 변경(`PATCH .../chapters/reorder → 200`, 트리 시각적 순서 교체 확인) + 부 순서 변경 동일 확인. 비트 시트 생성 버튼 클릭→실 LLM 호출(~68초)→무협/회귀 장르에 맞는 비트 목록 렌더 확인.
- DoD 충족: 부/챕터 드래그 재배열이 서버 반영, 비트 시트 생성이 실 LLM 결과 반환.
