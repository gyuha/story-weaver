<!-- forge-slug: new-part-stall-embedding-warmup -->
<!-- task: 59 -->
# RUN — 새 부 생성이 처음에 멈추는 문제: 임베딩 모델 워밍업 + 빈 본문 임베딩 차단

실행 형태: Claude Code Dynamic Workflow (5 에이전트 — 구현 병렬 2 → 마이그레이션 1 → 리뷰 1 → 조건부 수정 1).
모드: `tdd: on` (슬라이스마다 실패 테스트 선행 + 테스트 유효성 확인), `eco: on` (서브에이전트 `sonnet` 캡 + ECO 규율 주입).
도메인 에이전트: S1+S2와 mustFix 수정은 `llm-pipeline-engineer`, S3 마이그레이션은 `api-backend-builder`, S4는 `web-feature-builder`. 리뷰는 기본 워크플로우 서브에이전트.
서브에이전트 토큰 499k · 툴 호출 181회 · 소요 약 30분.

## 착수 전 코드베이스 확인으로 웨이브 배치를 바꾼 것

- **이 프로젝트의 pytest는 실제 `app_db`를 쓴다** (`tests/memory/test_memory_service.py`가 `AsyncSessionFactory`로 User·Work를 실제 삽입/삭제). S3의 `DELETE FROM embeddings WHERE content = ''`를 pytest와 동시에 돌리면 테스트 행을 지워 flaky가 되므로, S3를 api 트랙 뒤 **직렬**로 분리했다(플랜은 "depends: none"으로 병렬 가능하다고 봤다 — 플랜의 판단이 낙관적이었다).
- **alembic 체인은 `0001_initial_schema` 단일 head**(구 0001~0011 스쿼시, 2026-07-17). 새 마이그레이션의 `down_revision`이 여기 붙는다.
- 같은 영역 회고(`remove-scene-model` 1of2·2of2)의 규율을 적용: 병렬 슬라이스 중에는 저장소 전체 typecheck/lint를 게이트로 쓰지 않고(각자 scoped 테스트만), 최종 홀리스틱 게이트는 오케스트레이터가 직접 재실행해 확정한다.

## 계획대로 된 것

- **S1 빈 본문 임베딩 차단** — `memory_service.py`의 `_chunk_paragraphs`가 공백뿐인 본문에 `[]`를 반환(기존 `[body]` = `[""]`). `index_chapter`는 플랜대로 **미변경** — 청크가 `[]`가 되면 `rows=[]` + `delete_chunks_from(..., 0)`이 "본문을 전부 지운 화"의 잔존 청크까지 자동 정리하는 부수효과를 그대로 얻는다.
- **S2 임베딩 비블로킹화** — `embedding_client.py`에 `async def aembed_text`(`asyncio.to_thread(embed_text, text)`) 추가. 호출부 2곳 교체: `memory_service.py:63 index_source`, `memory_search_service.py:80 search`. `grep -rn "embed_text(\|embed_texts(" src`로 남은 동기 호출부 0 확인(정의부 2곳 + `aembed_text` 2곳만). 기존 동기 `embed_text`/`embed_texts`의 공개 계약과 `tests/memory/test_embedding_client.py`는 손대지 않았다(빈 문자열을 거르는 곳은 청킹 단계이지 이 함수가 아니다).
- **S2 부팅 워밍업** — `main.py`의 `lifespan`에서 Redis 풀 워밍업 직후 모델을 백그라운드로 로드. 부팅을 차단하지 않고(`await` 없음), structlog로 시작·완료·실패 각 1줄, 실패는 `except Exception`으로 삼켜 로그만 남기고 부팅 계속. **단 그 메커니즘은 리뷰에서 뒤집혔다 — 아래 "리뷰에서 잡은 결함" 참조.**
- **S2 테스트 배선 갱신** — `tests/memory/test_memory_service.py`의 monkeypatch 대상을 `embed_text` → `aembed_text`(비동기 fake)로 갱신. 기존 캐싱 테스트 2건(내용 불변 시 임베딩 스킵) green 유지.
- **S3 정리 마이그레이션** — `alembic/versions/0002_purge_empty_embeddings.py`. `down_revision = "0001_initial_schema"`, `upgrade()`는 `DELETE FROM embeddings WHERE content = ''`, `downgrade()`는 사유를 주석으로 명시한 no-op. autogenerate 미사용(스키마 변경 없음). `alembic upgrade head` 적용 → `SELECT count(*) FROM embeddings WHERE content = ''` → **0** 확인, `downgrade -1` → `upgrade head` 왕복도 에러 없이 확인.
- **S4 버튼 pending** — `work-tree.tsx`에 `isAddingPart`(boolean) / `addingChapterPart`(부 라벨 \| null) 상태 추가, `try/finally`로 설정·해제. `새 부`는 `disabled={isAddingPart}` + `Loader2 animate-spin`, `새 화`는 `disabled={addingChapterPart === part}`로 **그 부의 버튼만** 비활성(다른 부는 활성 유지). 실패 시 `finally`가 상태를 풀고 기존 `toast.error(apiErrorMessage(...))` 유지. 확인 모달 흐름 무변경.
- **TDD 규율 준수 + 테스트 유효성 확인** — 세 트랙 모두 수정 전 FAIL을 실제로 확인했다: 빈 본문 테스트 2건 FAIL / 동시성 테스트가 락 없는 원본에서 `calls == 8`(assert 1 실패) / 프론트는 `disabled` 속성 제거 시 2건 FAIL / mustFix 회귀 테스트가 수정 전 `0.40s` 블록으로 FAIL. 무의미한 테스트가 아님을 각각 증명했다.
- **Non-goals 무침범** — HF 오프라인 강제(`local_files_only`/`HF_HUB_OFFLINE`)·프리페치 장치 없음 · 전역 진행바 없음 · 낙관적 업데이트 없음 · 본문·엔티티 저장의 임베딩은 인라인 유지 · 새 부의 2회 순차 요청 유지 · 다른 화면 IME 가드 미착수 · `web/src/api/**`·`routeTree.gen.ts` 무변경 · DB 스키마 변경 없음(데이터 전용 마이그레이션).

## 리뷰에서 잡은 결함 (조건부 코드리뷰 — 데이터 DELETE 마이그레이션 + 동시성 = 위험 영역)

**major / mustFix 1건, in-run 수정 완료. 그리고 이건 구현 실수가 아니라 플랜이 지정한 결정이 틀린 사례다.**

- 플랜이 명시한 `asyncio.create_task(asyncio.to_thread(_get_model))` 워밍업은 **실제로 논블로킹이 아니었다.** `asyncio.to_thread`는 이벤트 루프의 *기본* `ThreadPoolExecutor`에 작업을 제출하고, uvicorn이 쓰는 `asyncio.Runner.close()`는 `loop.shutdown_default_executor(timeout=300)`을 호출해 그 executor의 실행 중 작업이 끝날 때까지 **프로세스 종료 자체를 막는다**. Task를 `cancel()`해도 이미 스레드에서 도는 `SentenceTransformer(...)` 생성자는 멈추지 않으므로 취소로 회피되지 않는다.
- 재현 시나리오: 워밍업이 끝나기 전(모델 로드 0.86~6초 구간)에 개발자가 코드를 저장하면 `uvicorn --reload`의 `BaseReload`가 옛 프로세스에 SIGTERM을 보낸 뒤 `process.join()`으로 동기 대기하는데, 옛 프로세스는 `shutdown_default_executor()`가 워밍업 스레드를 기다려야 exit하므로 그 몇 초 동안 새 프로세스가 뜨지 못한다. **원래 버그("새 부 만들면 UI가 멈춘다")가 "코드 저장하면 리로드가 멈춘다"로 자리만 옮기는 것이다.** 리뷰어가 `asyncio.Runner` + `ThreadPoolExecutor` + `to_thread`를 축소 재현한 스크립트로 확인했다(task는 cancel 후 0.2초에 반환했으나 Runner 컨텍스트는 백그라운드 스레드가 끝나는 3.0초까지 닫히지 않음).
- 수정: 워밍업을 `threading.Thread(target=..., daemon=True).start()`로 교체. 데몬 스레드는 loop의 기본 executor도, `concurrent.futures`의 atexit joiner도 추적하지 않아 리로드·종료를 막을 수 없다. 취소할 asyncio Task가 없어져 lifespan 종료부의 `cancel()+await` 블록과 `contextlib` import도 함께 제거됐다.
- 회귀 테스트 `test_lifespan_shutdown_does_not_block_default_executor_teardown` — lifespan을 수동 구동(`__aenter__` → 느린 fake `_get_model`이 스레드에서 도는 중 `__aexit__`)한 뒤, `asyncio.Runner.close()`가 실제로 호출하는 `loop.shutdown_default_executor()`가 즉시 반환하는지 검증한다.
- **잔여 critical·major 없음.** 나머지 5개 렌즈는 정상 판정: 마이그레이션 조건(`Embedding.content`가 `nullable=False`라 누락될 NULL 행이 없음 — 오케스트레이터가 모델 정의로 재확인)·재실행 안전성 / `_chunk_paragraphs` 변경이 `delete_chunks_from` 인덱스 계산과 정상 본문 청킹을 깨지 않음 / 오프로드 누락 없음 / 프론트 pending의 영구 disabled·부별 분리 / Non-goals 무침범.

## 도중에 내린 결정 (플랜 텍스트를 넘어선 것)

- **`lru_cache` 제거 → 수동 더블체크 락킹.** 플랜은 "`_get_model`에 `threading.Lock` 추가"였지만, `lru_cache`는 캐시 미스 시 사용자 함수를 **락 밖에서** 호출하므로 Lock만 얹어서는 워밍업과 첫 요청이 겹칠 때 생성자 중복 호출을 막지 못한다. 그래서 캐싱 로직 자체를 전역 `_model` + `threading.Lock` 더블체크로 교체했다. 8스레드 동시 호출 테스트(가짜 생성자에 0.05s sleep으로 레이스 창 확대)로 생성자 1회를 고정했다.
- **프론트에 재클릭 방지 가드를 넣지 않았다.** 처음엔 `if (isAddingPart) return;`를 handler에 넣었으나, 가드를 제거해도 테스트 6건이 전부 통과했다 — `disabled` 버튼은 클릭 이벤트 자체가 발생하지 않아 재호출이 애초에 불가능하다(jsdom·실브라우저 공통). ECO 원칙(불필요한 방어 코드 금지)에 따라 가드를 빼고 `disabled` 단독으로 처리. 판단 근거를 가드 제거 전/후 테스트 결과로 검증했다.
- 워밍업 태스크의 셧다운 처리: 최초 구현은 `cancel()` + `contextlib.suppress(CancelledError)`로 dangling-task 경고를 막았으나, 위 mustFix 수정으로 통째로 불필요해져 제거됐다.

## 최종 게이트 (오케스트레이터가 직접 재실행 — 자기보고 불신)

- api `task lint` → ruff `All checks passed!` · mypy `Success: no issues found in 159 source files`
- api `task test` → **925 passed · 1 skipped · 12 failed** (3분 07초), 커버리지 **79.71%**(≥70 충족)
  - **실패 12건은 전부 이번 변경과 무관한 기존 실패다.** `tests/test_dev_server.py::TestMakefileHotReload` 9건 + `tests/test_migrations.py::TestMakeMigrate` 3건이며, 원인은 `FileNotFoundError: /Users/gyuha/workspace/story-weaver/api/Makefile` — 이 저장소는 Taskfile(`task dev`)로 옮겨 Makefile이 없는데 그 테스트들이 Makefile 타깃 문자열을 검증한다. 이번 diff는 그 파일들을 건드리지 않았다(`git status api/`로 확인: `embedding_client.py`·`memory_search_service.py`·`memory_service.py`·`main.py`·`test_memory_service.py`·`test_main_runtime.py` 수정, `0002_purge_empty_embeddings.py`·`test_embedding_client_concurrency.py` 신규).
- web `pnpm typecheck` clean · `pnpm lint` clean(218 files) · `pnpm test` **47 files / 242 tests passed**(기존 238 + 신규 4)

## 막혔던 곳 / 환경 이슈

- 첫 api `task test`를 백그라운드로 돌렸다가 `killed`로 중단됐다 → 전면에서 재실행해 완주했다. 3분 넘게 걸리는 게이트는 전면 실행이 낫다.
- **기존 부채 발견(범위 밖)** — Makefile 기반 테스트 12건이 Taskfile 전환 이후 방치돼 상시 red다. 이번 작업이 만든 것이 아니라 손대지 않았으나, 상시 red인 스위트는 "이번 변경이 깨뜨렸는지"를 판단하는 비용을 매번 발생시킨다. 후속 작업 후보.
- **커밋하지 않았다.** 워크플로우 전 단계에 git commit 금지를 걸었으므로 변경은 작업 트리에만 있다.
- 워밍업 도입으로 `tests/test_main_runtime.py`의 lifespan 테스트가 실제 모델을 로드하게 됐다(데몬 스레드라 테스트를 블로킹하진 않는다). 테스트 스위트가 임베딩 모델에 의존하는 지점이 하나 늘어난 셈이다.

## 후속 작업 후보 (다음 fg-ask)

- Makefile 기반 테스트 12건 정리 — 삭제하거나 Taskfile 검증으로 이관.
- 회고 #58이 남긴 **한글 IME Enter 가드 전수 적용**(`memory-panel.tsx:648` 채팅 전송 등 4곳)이 여전히 미착수.
- 본문 저장 경로의 인라인 임베딩(청크당 0.09초)을 백그라운드로 뺄지 — 이번엔 의도적으로 Non-goal. 긴 본문에서 저장 지연이 실제로 거슬릴 때 숫자를 보고 판단.
