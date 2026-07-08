# RUN — M1: 엔티티 카드(World Bible) 백엔드

slug: m1-entity-card-backend · task: 30 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 2단계(eco: sonnet 상한 + ECO 규율 주입): Schema(S1+S2, TDD) → CRUD(S3, TDD, S1+S2 결과 의존). S4(계약 재생성·검증)는 직접 수행.

## 계획대로 된 것

- **S1+S2**: 신규 `worldbible` 도메인, `Entity`/`EntityType`(character/location/event/item) 모델 + 마이그레이션 `0005_worldbible_entities`. 타입별 attributes(JSONB) Pydantic 검증기(`validate_entity_attributes`) — 인물/장소/사건/아이템 4종 스키마, `extra="forbid"`로 교차 타입 필드 거부.
- **S3**: 엔티티 CRUD 4개 엔드포인트. `WorksService.get_work` 소유권 헬퍼 재사용(task 29 패턴 그대로). `entity_type`은 PATCH로 변경 불가(웹 mock의 기존 규칙과 일치 확인 후 반영).
- **S4**(직접): `task contract` 재추출, openapi.json에 엔티티 2개 경로 확인, 웹 typecheck/lint/test 회귀 없음.

## 계획 대비 차이 (divergences)

1. **`EntityType`을 Python `enum.StrEnum`으로 구현** — ruff UP042 권고 반영, 계획에 명시 안 됐지만 자연스러운 선택.
2. **attributes 필드 대부분 optional·기본값 처리** — data-model.md 3.2가 "MVP 초안" 키셋이라 명시해 부분 입력 허용(예: 인물 카드를 외모만 채우고 나머지는 비워도 저장 가능). `ItemAttributes.properties`도 구조 없는 평문 `str`로 단순화 — data-model.md가 "효과·속성"만 언급하고 구조를 정하지 않았음.
3. **에이전트가 검증 중 `git stash -u`를 잘못 실행했다가 즉시 `git stash pop`으로 복구** — 실제로는 이 시점에 사용자가 별도로 task 26·27 작업을 직접 커밋(`f600548`, 이 드라이브와 무관)한 상태였음. 커밋 직후 실행된 stash/pop이 서로 부딪힐 뻔했으나, 직접 `git status`/`git log`로 확인한 결과 손실·중복 없이 정상 복구됨(task 30 파일 전부 온전).

## 알려진 한계 / 후속 후보

- task 29와 동일한 마이그레이션 drift(무관, 기존 스키마) 재확인·제외.

## 검증 (UAT)

- api: `task lint` — 신규 코드 0 에러(기존 test_auth_flows.py 7건만 무관하게 남음). `task test` — 709 passed(task 29의 684 + 신규 25), 1 skipped, 12 failed(전부 무관 baseline).
- 마이그레이션 SQL 직접 리뷰: enum·FK cascade·JSONB·인덱스 전부 정확.
- 계약: `task contract` → `/entities`, `/entities/{entity_id}` 확인. web: typecheck/lint/test(45) 통과.
- DoD 충족: 인물·장소·사건·아이템 카드 생성·조회·수정·삭제 가능, 인물 카드가 관계 목록 저장 가능.
