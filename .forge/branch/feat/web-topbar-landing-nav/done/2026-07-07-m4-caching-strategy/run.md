# RUN — M4: 캐싱 전략(임베딩 캐싱 + 결정적 결과 캐싱)

slug: m4-caching-strategy · task: 41 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

작은 응집 단위(S1+S2)라 워크플로우 1단계로 처리.

## 계획대로 된 것

- **S1**: `MemoryService.index_source`에 기존 `Embedding.content`와 신규 콘텐츠를 문자열 비교하는 체크 추가 — 변경 없으면 `embed_text()` 호출 자체를 스킵. 별도 해시 컬럼/마이그레이션 불필요(이미 `content`가 마지막 임베딩 원문을 그대로 저장하고 있어 비교 가능 — YAGNI로 마이그레이션 생략).
- **S2**: `correct` 엔드포인트 전용 Redis 캐시(`assist/correct_cache.py`, 5분 TTL, 키=`work_id`+텍스트 해시). **소유권/씬 존재 확인이 캐시 조회보다 항상 먼저** — 다른 테넌트의 캐시된 결과가 새지 않도록. 캐시 히트 시 LLM 미호출.

## 계획 대비 차이 (divergences)

없음 — 계획대로 구현되고 검증됨. S1이 계획에서 시사한 "해시 컬럼" 대신 기존 `content` 필드 직접 비교로 더 단순하게 해결한 점만 사소한 최적화(마이그레이션 불필요).

## 검증 (UAT)

- api: `task lint`(신규 코드 0 에러, 7건 baseline만) / `task test`(829 passed, 1 skipped, 12 failed 전부 무관). `git stash` 대조로 baseline과 신규 실패 없음 재확인(에이전트 자체 검증).
- **직접 코드 리뷰로 보안 확인**: `assist_correct` 라우터에서 `build_messages`(소유권 체크)가 캐시 조회(`correct_cache.get_cached`)보다 항상 먼저 실행됨을 확인 — cross-tenant 캐시 누출 없음.
- DoD 충족: 동일 콘텐츠 재저장 시 재임베딩 안 함(캐시 히트), 동일 교정 요청 반복 시 캐시된 결과 반환.

## M4 전체 완료

task 39(budget/rate)·40(모더레이션)·41(캐싱)로 M4(출시 게이트) 완성. C8 통과.
