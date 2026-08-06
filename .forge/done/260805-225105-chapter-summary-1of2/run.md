<!-- forge-slug: chapter-summary-1of2 -->
<!-- task: 67 -->
# RUN — 화 요약 (1/2) 저장할 자리와 생성 엔드포인트

실행 형태: **직접 실행(워크플로우 아님).** api 8파일에 순차 의존이 있어 병렬 이득이 없다.
모드: `tdd: on`, `eco: on`. `Run all` 배치의 1/2번째(#67 → #68).

## 슬라이스 결과

- S1 `chapters.summary` 저장 경로(마이그레이션·모델·스키마·문서) — ⚠ 라우터의 손조립 응답 헬퍼를 함께 고쳐야 했다(아래)
- S2 요약만 저장할 때 재임베딩하지 않기 — ✅ 계획대로
- S3 assist `summary` 태스크 — ⚠ 계획이 나열하지 않은 배선 3곳이 더 있었다(아래)

## 계획대로 된 것

- **TDD 규율을 지켰다.** S1은 `summary == None` 불일치, S2는 요약만·제목만 PATCH에서 재색인 2건, S3는 `TaskType.summary` 부재(수집 에러)로 각각 red를 먼저 봤다.
- **마이그레이션을 양방향 확인했다**(`api/CLAUDE.md`가 요구하는 리뷰). `alembic upgrade head` → `\d chapters`로 컬럼 확인 → `downgrade -1` → 컬럼 0개 확인 → 다시 `upgrade head`. autogenerate를 쓰지 않고 손으로 썼다(`add_column`/`drop_column` 두 줄이라 생성기가 더 위험하다).
- **`exclude_unset` 판정을 실측 근거대로 구현했다.** 계획에 적어둔 `ChapterUpdate(body='')` → `{'body': ''}`가 그대로라, 조건을 `"body" in changes`(키 존재)로 썼다.
  - **그 방어가 실재하는지 직접 확인했다** — 조건을 `changes.get("body")`(falsy 판정)로 임시 교체하고 재실행하니 **`test_emptying_body_reindexes`만 정확히 red**가 됐다(1 failed, 5 passed). 나머지 5건은 통과하므로, 이 실수는 그 테스트 하나만이 잡는다. 복원 후 6 passed.
- **곁들여 얻은 것**: 제목만 바꿀 때도 본문 전체가 재임베딩되던 기존 낭비가 같이 사라졌다.
- **비목표 무침범** — web 무변경 · `pnpm generate` 안 함 · 요약 자동 생성 없음 · 요약을 임베딩 대상에 넣지 않음 · 일괄 요약 없음 · 요약 이력 없음 · 새 ADR 없음 · `create_chapter`의 색인 호출 무변경.

## 계획과 달라진 것 (divergence)

1. **응답에 `summary`가 안 나왔다 — 라우터가 필드를 손으로 나열한다.** `_to_chapter_response`(`manuscript_router.py:82`)가 `ChapterResponse(id=…, title=…, body=…)`처럼 필드를 하나씩 적어 넘긴다. 스키마에 필드를 더해도 여기서 빠지면 응답에 나오지 않고, **`summary` 기본값이 `None`이라 타입 에러도 나지 않아 조용히 통과했다.** 계획은 "스키마 2곳"만 적었는데 실제로는 3곳이었다. TDD가 아니었으면 "저장은 되는데 화면에 안 보인다"로 UAT에서 발견됐을 것이다.
2. **S3의 배선이 계획보다 3곳 많았다.** 계획은 "`TaskType`·`TASK_TIER`·`_TASK_INSTRUCTION`·요청 스키마·라우터"를 적었지만 실제로는 추가로 ① `SummaryInput` 데이터클래스 + `AssistTaskInput` 유니온(`assist_schemas.py`) ② `prompt_assembler`의 태스크 분기(`isinstance` 검사 + user_text 조립) ③ `assist_service`의 메모리 생략 목록(`correct`·`title_`에 `summary` 추가)이 필요했다. 태스크 추가가 "표 두 줄"이 아니라 도메인 4파일에 걸친 배선임을 계획이 과소평가했다.
3. **테스트 픽스처 형식을 두 번 고쳤다.** `tests/assist/test_assist_router.py`는 `_create_episode` 헬퍼가 없고 `_create_chapter(app, owner, work_id)` + `two_users` 픽스처를 쓴다. 다른 파일 관례를 그대로 복사해 실패했다.
4. **lint 자동수정 2건** — 내가 추가한 import 정렬과 불필요한 `noqa: SLF001`(`SLF001`이 이 저장소에서 비활성). `ruff check --fix`로 정리.
5. **`tier_routing` docstring 줄 폭 초과 1건** — 한 줄로 쓴 설명을 여러 줄로 나눴다.

## 최종 게이트 (직접 재실행)

- `uv run ruff check src tests` → All checks passed! · `uv run mypy src` → Success (159 files)
- `uv run pytest` → **949 passed, 1 skipped, 12 failed** — 실패 12건은 전부 `Makefile` 부재(Taskfile 이전 후 방치된 사전 존재 실패)로 **이번 변경으로 인한 신규 실패 0**. 신규 테스트 9건(S1 1 · S2 4 · S3 2 + 티어 1 + 누출목록 파라미터 1).
- 마이그레이션: `upgrade head` → 컬럼 존재 확인 → `downgrade -1` → 컬럼 0 → `upgrade head` 재적용까지 실행해 확인.

## 막혔던 곳 / 환경 이슈

- 없음. 손조립 응답 헬퍼(divergence 1)를 테스트가 즉시 잡았다.
- **미커밋** — 이 파트의 api 변경 + `docs/data-model.md`. `.forge/codebase/` 7파일은 이전 세션의 fg-map 재생성분으로 여전히 미커밋으로 남아 있다.

## 후속 작업 후보

- **part 2/2(`chapter-summary-2of2`)** — 버튼 배선·모달·검토 화면. 이 파트가 OpenAPI를 바꿨으므로 거기서 `pnpm generate`를 돌린다.
- `_to_chapter_response`처럼 **필드를 손으로 나열하는 응답 헬퍼**가 다른 도메인에도 있는지 훑어볼 가치가 있다 — 스키마에 필드를 더해도 조용히 누락되는 구조다.
- **`Makefile` 참조 테스트 12건** — 네 사이클 연속 미룸.
