# 2026-07-26 — 새 부 생성이 처음에 멈추는 문제: 임베딩 모델 워밍업 + 빈 본문 임베딩 차단

## 계획 vs 실제

- **계획대로 된 것**: DoD 6항목 전부 충족. S1(빈 본문 → 청크 0개)·S2(`aembed_text` 오프로드 + 부팅 워밍업)·S3(`0002_purge_empty_embeddings`)·S4(버튼 pending) 완성기준 충족, Non-goals 무침범, 신규 의존성 0. 게이트: api ruff clean·mypy 159파일 clean·pytest 925 passed/커버리지 79.71%, web typecheck·lint clean·test 47파일 242건. UAT 4항목(워밍업 로그, 워밍업 중 새 부 1초 내 생성, 메모리 패널 첫 오픈, 리로드 무지연) 육안 통과. DB 확인: 빈 본문 chapters 3건에 embeddings 0행.
- **진짜 divergence(하나) — 책임은 구현이 아니라 계획에 있다.** 그릴링 단계에서 워밍업 방식을 물을 때 선택지에 `lifespan에서 create_task(to_thread(_get_model))`라고 **구체 API를 적어 넣었고**, 그것이 플랜에 그대로 박혔다. 그 메커니즘은 자신의 목표("부팅을 차단하지 않는다")를 달성하지 못한다 — `asyncio.to_thread`는 이벤트 루프의 *기본* `ThreadPoolExecutor`에 제출되고, uvicorn이 쓰는 `asyncio.Runner.close()`가 `loop.shutdown_default_executor(timeout=300)`으로 그 executor를 기다리므로 **지연이 요청 경로에서 프로세스 종료·리로드 경로로 옮겨갈 뿐이다.** 워밍업 중 코드를 저장하면 `uvicorn --reload`의 `process.join()`이 모델 로드가 끝날 때까지 리턴하지 않는다. 조건부 코드리뷰가 축소 재현 스크립트로 잡아 `threading.Thread(daemon=True)`로 고쳤다.
  - **가장 중요한 관찰**: 구현 에이전트는 "실행 중인 스레드풀 작업은 즉시 중단되지 않는다"는 사실을 **알고 있었고 run.md에 적었다.** 그런데 그 결과를 "dangling-task GC 경고 방지" 수준으로 축소 해석했다. 플랜이 메커니즘을 명시하면 구현자는 그것을 검증 대상이 아니라 요구사항으로 취급한다.
- **플랜의 슬라이스 의존성 판정 오류(착수 전에 잡음)**: S3에 `depends: none`이라 적혀 병렬 가능해 보였으나, 이 프로젝트의 pytest는 실제 dev `app_db`를 쓴다(`tests/memory/test_memory_service.py`가 `AsyncSessionFactory`로 User·Work를 실제 삽입/삭제) → `DELETE FROM embeddings WHERE content = ''`를 테스트와 동시에 돌리면 테스트 행을 지워 flaky가 된다. 웨이브 배치를 직렬로 바꿨다.
- **플랜 문구를 넘어선 현장 결정 2건**: ① `lru_cache` 제거 → 전역 `_model` + `threading.Lock` 더블체크 락킹(플랜은 "`_get_model`에 Lock 추가"였지만 그것만으로는 부족 — 아래 학습 참조). ② 프론트에 재클릭 방지 가드를 넣지 않고 `disabled` 단독 처리 — 가드를 제거해도 테스트 6건이 전부 통과함을 확인했다(`disabled` 버튼은 클릭 이벤트 자체가 발생하지 않는다).
- **범위 밖 부채 발견**: `tests/test_dev_server.py::TestMakefileHotReload` 9건 + `tests/test_migrations.py::TestMakeMigrate` 3건이 `FileNotFoundError: api/Makefile`로 **상시 red**다. 저장소가 Taskfile로 옮긴 뒤 방치된 것으로, 이번 변경과 무관해 손대지 않았다.

## 학습

- **다음엔 이렇게 ① — 플랜은 관찰 가능한 목표를 못박고, 런타임 메커니즘의 API 선택은 못박지 않는다.** 이번 플랜이 `create_task(to_thread(...))`를 지정한 대신 완성기준을 "부팅과 `--reload` 재시작이 모델 로드에 지연되지 않는다(축소 재현 또는 회귀 테스트로 확인)"로 썼다면, 구현자가 API를 고르면서 스스로 검증했을 것이다. **그릴링에서 특정 API를 선택지에 써 넣는 것은 그것을 검증 면제 대상으로 만드는 행위다.** 메커니즘을 꼭 적어야 할 때는 "이 메커니즘이 목표를 달성하는지 확인"을 완성기준에 함께 넣는다.
- **다음엔 이렇게 ② — `asyncio.to_thread`는 fire-and-forget 백그라운드 작업에 쓰지 않는다.** 기본 executor에 제출되므로 `loop.shutdown_default_executor()`(파이썬 3.12의 `asyncio.Runner.close()`가 최대 300초 대기)에 걸려 **프로세스 종료를 붙잡는다.** 감싼 Task를 `cancel()`해도 이미 스레드에서 도는 작업은 멈추지 않으므로 취소로 회피되지 않는다. 부팅 워밍업·모델 로드처럼 "끝나든 안 끝나든 종료를 막으면 안 되는" 작업은 `threading.Thread(target=..., daemon=True)`가 맞다(데몬 스레드는 loop의 executor도 `concurrent.futures`의 atexit joiner도 추적하지 않는다). 요청 처리 중의 블로킹 호출 오프로드에는 `to_thread`가 그대로 맞다 — 구분 기준은 "종료를 기다려도 되는 작업인가"다.
- **다음엔 이렇게 ③ — `functools.lru_cache`는 지연 초기화의 동시성 가드가 아니다.** 캐시 미스 시 사용자 함수를 **락 밖에서** 호출하므로, 초기화 함수 안에 Lock을 얹는 것으로는 중복 초기화를 막지 못한다. 프로세스당 1회를 보장해야 하면 전역 변수 + `threading.Lock` 더블체크로 캐싱 자체를 바꾼다. 검증은 여러 스레드 동시 호출 + 가짜 생성자에 sleep을 넣어 레이스 창을 넓히는 방식이 유효했다(락 없는 원본에서 `calls == 8`, 수정 후 `calls == 1`).
- **다음엔 이렇게 ④ — api 슬라이스의 병렬 가능 여부는 "파일 충돌"만으로 판정하지 않는다.** 이 프로젝트의 pytest는 dev `app_db`를 공유하므로, **데이터를 조작하는 마이그레이션·스크립트 슬라이스는 테스트를 돌리는 슬라이스와 절대 병렬로 두지 않는다.** 플랜 작성 시 `depends:`를 파일 그래프뿐 아니라 공유 자원(DB·포트·dev 서버) 기준으로도 판정할 것.
- **유지할 것 — 조건부 코드리뷰가 2연속으로 major 결함을 잡았다.** #58(동일 장르 재클릭 시 키워드·문체 조용한 초기화)과 이번(워밍업이 종료를 붙잡음) 둘 다 **테스트가 전부 green인 상태에서 살아 있던 결함**이고, 둘 다 리뷰어가 실제 재현으로 확인했다. 위험 영역(데이터 변경·마이그레이션·동시성·인증) 판정 시 리뷰 단계를 붙이는 규칙은 값을 하고 있다.
- **유지할 것 — 최종 게이트는 오케스트레이터가 직접 재실행한다.** 이번에도 서브에이전트 자기보고와 별개로 전 게이트를 재실행했고, 그 덕에 "실패 12건"을 만나서도 그것이 Makefile 부재로 인한 기존 red임을 `git status`로 즉시 분리 판정할 수 있었다. 다만 **상시 red인 스위트는 매 작업마다 "내가 깨뜨렸나" 판정 비용을 발생시킨다** — 정리 대상이다.
- **환경 사실** — 3분 넘게 걸리는 게이트(api `task test` = 3분 07초)를 백그라운드로 돌렸다가 `killed`로 중단됐다. 긴 게이트는 전면 실행이 낫다.
- **잔여 부채** — 워밍업 도입으로 `tests/test_main_runtime.py`의 lifespan 테스트가 실제 임베딩 모델을 로드한다(데몬 스레드라 테스트를 블로킹하진 않는다). 테스트 스위트가 모델 파일에 의존하는 지점이 하나 늘었다.

## Doc updates

- CONTEXT.md 승급: none — 새 도메인 용어가 없다. 부·화·메모리는 기존 용어이고, "빈 본문은 인덱싱하지 않는다"는 구현 세부이므로 글로서리에 넣지 않는다.
- ADR 추가: none — 워밍업 방식은 3조건 게이트를 통과하지 못한다. 되돌리기가 몇 줄이라 "되돌리기 어려움"이 아니고, "맥락 없이 놀라움"은 `main.py`에 이미 있는 10줄 주석이 해소한다. 사소한 결정을 ADR로 남기면 진짜 중요한 12건이 묻힌다.

## 후속 작업 후보 (다음 fg-ask)

- **Makefile 기반 테스트 12건 정리** — 삭제하거나 Taskfile 검증으로 이관. 상시 red 제거.
- **한글 IME Enter 가드 전수 적용** (#58 잔여, 미착수) — `memory-panel.tsx:648` 채팅 전송이 최우선(매일 쓰는 경로), 그 외 `synopsis-editor.tsx:97`·`manuscript.tsx:232`·`work-tree.tsx:418`. 공용 헬퍼로 묶어 재발 차단.
- 본문 저장 경로의 인라인 임베딩(청크당 0.09초)을 백그라운드로 뺄지 — 이번엔 의도적 Non-goal. 긴 본문에서 저장 지연이 실제로 거슬릴 때 숫자를 보고 판단.
- #58 잔여: jsdom cmdk 폴리필을 `src/test/setup.ts`로 승급(2곳 중복) · Base UI `nativeButton` 경고 정리 · dev 백엔드 일회용 QA 계정·작품 데이터 정리 · 장르 프리셋 키워드·문체 예시 문안 검수.
