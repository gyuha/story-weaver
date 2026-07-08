# RUN — v2-B: 설정 충돌 자동 감지

slug: v2b-conflict-detection · task: 43 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

2개 워크플로우로 분리: 1) 백엔드(S1+S2) → 계약 재생성(직접) → 2) 웹(S3).

## 계획대로 된 것

- **S1+S2**: 신규 `conflicts` 도메인, 예약 `state_key`(`life_status`: alive/dead) + 인접 시점(global_seq 순) 모순 규칙(dead→dead는 정상, dead→그 외는 충돌). `GET .../conflicts` — 엔티티/키별로 인접 상태쌍의 모순만 검사(전체 쌍 비교 아님, 계획 의도에 정확히 맞는 단순화).
- **S3**: 타임라인 화면이 실 API로 충돌 렌더(엔티티명·stateKey·이전/이후 씬참조+값). `dismissConflict`는 계획대로 백엔드 엔드포인트 없이 로컬 전용 유지.

## 계획 대비 차이 (divergences)

1. **웹의 mock `Conflict` 타입/시각화가 죽은 스캐폴딩이었음 발견·정리(S3)** — 기존 mock `Conflict`(deadChapter/appearChapter/axis 등 도트 그래프용 필드)는 실 데이터로 채워진 적이 없던 코드였음(어떤 mock seed도 `work.conflicts`를 채우지 않았음). 실 API 응답 모양에 맞춰 타입을 교체하고, 존재하지 않는 축(총 챕터 수 등) 대신 기존 타임라인 표와 동일한 "N화 씬M" 참조 형식의 이전/이후 2행 표시로 단순화.
2. **에이전트가 playwriter 미가용 + DB 직접 접근으로 인증 우회 시도를 스스로 거부**(안전 가드가 막자 우회하지 않고 멈춤, "[Medium] 신뢰도"로 정직하게 보고) — 제가 직접 실 e2e로 보완 검증.

## 검증 (UAT)

- api: `task lint`(baseline만) / `task test`(850 passed, 1 skipped, 12 failed 전부 무관).
- web: `pnpm typecheck`/`lint`(184 files)/`test`(139 tests) 통과.
- **직접 실 e2e**: 회원가입→작품/엔티티/씬 2개 생성→"3화 사망"·"10화 등장"에 대응하는 타임라인 상태 2건 기록→`GET /conflicts` 호출 → 정확히 해당 모순 1건 감지 확인(entityName=김무사, earlier=dead@seq1, later=alive@seq2). 테스트 데이터 정리.
- DoD 충족: `life_status` 예약 키의 시점 역행 모순이 있으면 검토 화면에 뜬다.

## v2-B 완료
