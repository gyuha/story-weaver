# run — 화 버전 기록 (1/2): 저장마다 스냅샷을 쌓는 백엔드

실행: Dynamic Workflow (에이전트 5개, sonnet + ECO 규율, 서브에이전트 토큰 666,678 / 도구 호출 278 / 60분)
구성: 구현 A(S1+S2, `api-backend-builder`) → 구현 B(S3+S4, `api-backend-builder`) → 검토 병렬 2(계획 대조 / `security-tenant-reviewer`) → 수정(`api-backend-builder`)

## 슬라이스별 결과

- S1 `chapter_versions` 모델 + Alembic `0004`(테이블·인덱스 2개·`body <> ''` 백필) — ⚠ `created_at`을 `now()` 대신 `clock_timestamp()`로, 복합 인덱스를 `op.execute` raw SQL로 (둘 다 계획의 "확인 필요"를 실측해 정한 것)
- S2 `update_chapter`의 버전 생성 훅(dedup·요약 스냅샷) + repository 2메서드 — ⚠ 리뷰가 실제 버그를 잡아 dedup 분기에 요약 동기화를 추가 (계획의 완성 기준이 `body+summary` 동시 PATCH 케이스를 빠뜨렸다)
- S3 조회 API 2개(페이지네이션·`char_delta`·소유권) + 스키마 3개 + repository 3메서드 — ⚠ `char_count`를 계획 문구의 `char_length(body)`가 아니라 **공백류 제거 후 글자 수**로 (web 상태바와 맞추라는 계획 지시를 따른 결과)
- S4 `docs/openapi.json` 재생성 — ✅ 계획대로 (+271줄, 삭제 0, 추가 경로 정확히 2개·추가 스키마 정확히 3개)

## 게이트 (메인 세션이 직접 재실행해 확인)

- `PYTHONPATH=src uv run pytest tests -q` → **977 passed, 12 failed, 1 skipped**, 커버리지 **79.91%** (≥70% 통과)
  - 12 실패는 전부 `tests/test_dev_server.py`·`tests/test_migrations.py`의 **기존 실패**다. 근거: 이 테스트들이 참조하는 `Makefile`이 저장소에 없다(`ls Makefile api/Makefile` → 둘 다 No such file — 저장소가 Taskfile로 옮겨간 흔적). 이번 변경과 무관.
  - manuscript 도메인만: **68 passed** (수정 전 66 → 리뷰 findings의 회귀 테스트 2건 추가분)
- `uv run ruff check src tests alembic` → **All checks passed!**
- `uv run mypy src` → **Success: no issues found in 159 source files**
- `uv run mypy src/domains/manuscript --strict` → **Success: no issues found in 12 source files**
  - (`mypy src --strict` 전체는 `src/domains/memory/embedding_client.py:39,44`에서 2건이 나지만 이번 작업이 건드리지 않은 파일이고 `git status`에 없다 — 기존 상태)
- `uv run alembic current` → **`0004_chapter_versions (head)`** — 개발 DB에 실제 적용돼 있다

## 계획의 "확인 필요" 4건 — 전부 실측으로 닫혔다

1. **`now()`의 트랜잭션 시각 문제.** psql 실측: 같은 트랜잭션에서 두 SELECT의 `now()`가 동일 값, `clock_timestamp()`는 50ms sleep 사이에서 값이 달라짐. → `server_default=func.clock_timestamp()` 채택. 단 `clock_timestamp()`도 한 SQL 문장 내 `generate_series` 같은 무간격 루프에서는 마이크로초 동률이 가능함을 별도 실측으로 확인 — 실제 호출 경로(요청당 append 최대 1개, asyncpg 라운드트립 개입)에서는 해당 없음을 모델 docstring에 `eco:` 주석으로 명시.
2. **dedup의 미커밋 행 가시성.** `core/database.py`에서 `autoflush=False` 확인 → 기존 `add_episode`/`add_chapter` 관례대로 `add_version`에 명시적 flush. 한 요청 안에서 두 번 append하는 경로가 생겨도 무력해지지 않도록 전용 테스트(`test_add_version_visible_to_get_latest_within_same_uncommitted_session`)로 고정. 같은 테스트가 `created_at` 정렬 결정성도 함께 단정한다.
3. **백필 UUID.** psql로 `SELECT gen_random_uuid();` 직접 실행 → PG16 코어 내장으로 동작, `pgcrypto` 불필요. Python 루프 대체 안 함.
4. **글자 수 규칙.** web 상태바는 `editor.getText().replace(/\s/g,'').length`(공백류 제거)임을 코드에서 읽어 확인. Postgres `regexp_replace(body,'\s','','g')`와 Python `re.sub(r'\s','',body)` 양쪽을 psql로 실측(전각 공백 U+3000까지 동일 제거 확인) → 서버를 그쪽에 맞췄다. 남는 이론적 차이(JS `\s`의 BOM 포함 vs Python `re` 미포함 등)는 원고 본문에 나올 수 없는 극단 케이스로 판단해 docstring에 명시.

## 발산

1. **리뷰가 계획이 놓친 실제 버그를 잡았다 — 이번 사이클에서 가장 값이 큰 사건.**
   `PATCH { body: 직전과 동일, summary: 새 요약 }`에서 `"body" in changes`가 참이라 `elif "summary"` 분기를 타지 않고, dedup이 조기 return해 **`chapters.summary`는 갱신되는데 최신 버전의 `summary`는 이전 값에 남았다** — ADR 260805-214733이 세운 "최신 버전 = 현재 화 상태의 거울" 불변식이 깨진다. `security-tenant-reviewer`가 임시 스크립트로 실제 DB에 재현해 확인했다(리뷰 후 파일 삭제).
   **원인은 구현이 아니라 계획이다.** 내가 쓴 S2 완성 기준 4항목(다른 본문 2회 / 같은 본문 재PATCH / `summary`만 PATCH / `body=""`)이 **`body`와 `summary`가 한 PATCH에 함께 오는 조합**을 빠뜨렸고, 기존 테스트도 전부 둘을 별도 PATCH로만 보내 커버하지 않았다. 그릴링에서 요약 불변식을 한 라운드 통째로 파고들었는데도 이 조합을 못 봤다.
   수정: `_append_version_if_changed`의 dedup 조기 return 직전에 `latest.summary = chapter.summary`. 회귀 테스트 `test_body_and_summary_together_with_dedup_still_syncs_latest_summary` 추가.
   **이 방어의 red는 메인 세션이 직접 확인했다** — 수정 에이전트가 그 검증 중에 죽어 아무도 확인하지 않은 상태였다. `latest.summary = chapter.summary`를 `pass`로 바꿔 실행하니 그 테스트 **하나만** 실패하고(`AssertionError: assert None == '새 요약'`) 나머지 7개는 통과했다. 즉 ① 테스트가 실제로 이 방어를 보고 있고 ② 과도하게 넓지 않으며 ③ **red가 난 명제가 목표와 같다**(프록시가 아니라 "최신 버전의 요약이 현재 화 상태와 같다" 자체). 복원 후 68 passed, `TEMP-RED-CHECK` 흔적 0건 확인.
2. **수정 단계 에이전트가 API 529로 죽었다.** 다만 죽은 시점이 **수정과 테스트를 이미 적용한 뒤 최종 pytest 실행 중**이라(마지막 도구가 Bash) 산출물은 온전했다. `fix: null`은 StructuredOutput을 못 돌려준 결과일 뿐이다. 메인 세션이 코드를 직접 읽어 두 수정(서비스 코드 + 회귀 테스트 2건)이 제자리에 있음을 확인하고 게이트를 직접 재실행했다 — 워크플로우 resume 불필요. **워크플로우 결과의 `fix: null`만 보고 "수정 안 됨"으로 판단했다면 이미 된 일을 다시 시켰을 것이다.**
3. **`char_count`가 계획 문구에서 이탈했다.** 계획은 `char_length(body)`라고 썼지만 같은 계획의 "확인 필요"가 "web과 어긋나면 맞춰라"라고 지시했고, 실측 결과 web이 공백을 제외하므로 서버를 그쪽에 맞췄다. 문구 대 지시가 상충할 때 지시를 택한 것 — 결과적으로 #73의 표시 보정 과제가 사라졌다.
4. **`create_chapter`가 버전 훅을 우회한다** (리뷰 medium, `fix_needed: false`로 이번 범위 밖). **메인 세션이 리뷰어 주장을 직접 확인했다**: `manuscript_service.py:142-149`가 `Chapter(..., body=data.body)`로 생성하고 `_append_version_if_changed`를 부르지 않는다 — `setattr` 경로를 안 타므로 생성 시점 본문이 버전에 안 남는다. **계획과 ADR이 "저장소 전체에서 `chapter.body`를 쓰는 지점은 `setattr` 하나뿐"이라고 적은 근거가 이 생성 경로를 놓쳤다** — 그릴링 때 내 grep이 `\.body = `와 `setattr(chapter`만 봤고 **생성자 키워드 인자는 패턴에 없었다**. 지금 트리거되지 않는 것도 확인했다: `web/src/features/shared/store/works.store.ts:504-507`의 `createChapter`가 `{ title: '새 화', orderIndex }`만 보내고 `body`를 싣지 않는다(읽어서 확인). 가져오기·복제·템플릿 기능이 생기면 생성 시점 원고가 유실된다. 후속 과제.
5. **백필 방어의 red 재현을 생략했다.** `body <> ''` 제외 조건은 1회성 DDL이라 pytest로 상시 검증할 수 없고, red 재현은 라이브 개발 DB를 훼손할 위험이 있어 psql 카운트 비교(본문 있는 화 수 = 버전 행 수)로 갈음했다. 검토 에이전트가 독립적으로 재확인했을 때 카운트가 6이 아니라 7이었는데, 그 사이 dev 사용으로 화가 하나 늘어난 것이고 **여전히 서로 일치**한다는 것이 요점이다.
6. **`downgrade`가 파괴적이다.** `0004`의 `downgrade()`는 `chapter_versions`를 DROP하며 백필분을 포함한 모든 스냅샷이 영구 삭제된다. 마이그레이션 docstring에 명시했으나 운영 적용 전 별도 백업이 필요하다.
7. **복합 인덱스를 raw SQL로 만들었다.** `op.create_index`의 `desc` 표현 API가 애매해 `op.execute`로 가고, ORM `__table_args__`에는 `Index(name, "chapter_id", created_at.desc())`를 미러링해 향후 autogenerate가 "누락"으로 오탐하지 않게 했다(sandbox에서 `CreateIndex` DDL을 렌더해 desc 반영 확인).
8. **방어 제거 → red 확인을 10건 수행했다.** 구현 A 4건(dedup 비교조건 / `"body" in changes` 키 판정 / 요약 갱신 / `create_chapter` 버전 미생성), 구현 B 4건(`char_count` 공식 / `limit+1` 페이지 트릭 / 소유권 검증 / `Query` 상하한), 수정 2건. 그중 하나가 부수 소득을 냈다 — `Query(ge=0)`을 제거하니 `offset=-1`이 422가 아니라 asyncpg `InvalidRowCountInResultOffsetClauseError`로 **처리되지 않은 500**까지 났다. 상하한이 단순 API 계약이 아니라 미처리 예외를 막는 안전장치임이 실측으로 드러났다.

## 계획 대조 · Non-goals

계획 대조 에이전트 판정 **pass, findings 0** — 4개 슬라이스의 완성 기준을 코드·DB·테스트 재실행으로 하나씩 대조했다(`\d chapter_versions`로 FK CASCADE와 인덱스 2개 실물 확인, openapi 재생성 후 diff 없음 확인 포함).

Non-goals 침범 없음:
- 복원 전용 엔드포인트 만들지 않았다(되돌리기는 기존 PATCH 재사용)
- 보존 상한·정리 로직 없다
- `web/`을 수정하지 않았다(`git status --short`에 web 파일 없음 — 다만 글자 수 규칙 확인을 위해 **읽기만** 했다)
- 요약 자체의 버전 이력, 시놉시스·부·작품 단위 버전, 버전 삭제·이름 붙이기 없다

## #73에 넘기는 것

- `char_count`는 이미 web 규칙(공백 제외)에 맞춰져 있다 — **표시 보정 과제가 사라졌다.** 계획 2of2의 "글자 수 규칙 일치" 확인 항목은 닫힌 것으로 봐도 된다.
- 응답 필드명은 camelCase다(`charCount`·`charDelta`·`hasSummary`·`createdAt`) — 기존 스키마 관례.
- 목록 응답에 `body`가 없다. 항목을 고르면 단건 조회를 한 번 더 해야 한다(계획대로).
- `limit`은 1~100, `offset`은 0 이상. 초과·음수는 422.
- 가장 오래된 버전의 `charDelta`는 `null`이다 — 표시에서 생략해야 한다.
