# RUN — 설정 이미지 (2/3): 프롬프트 조립 · 게이트웨이 생성 · 비전 역번역 · SSE 라우트

slug: entity-setting-image-2of3 · task 77 · part 2/3 · tdd: on
실행: 2026-08-12 · Dynamic Workflow(에이전트 5개, `api-backend-builder` 1 + `llm-pipeline-engineer` 4, eco→sonnet) + 직접 실행(설정 버그 검증·회귀 가드·통합 검증)

## 슬라이스별 결과

- S1 4종 유형별 프롬프트 조립 — ⚠ 계획대로 착지, 사건·아이템 매핑을 이번에 정의(문서에 없었다)
- S2 게이트웨이 이미지 생성 어댑터 — ⚠ 계획대로 착지, **범위 밖 사전 버그를 하나 발견해 고쳤다**
- S3 비전 역번역 어댑터 — ⚠ 계획대로 착지, 목 주입을 위해 시그니처에 키워드 인자를 추가
- S4 두 호출의 `llm_calls` 기록 — ✅ 계획대로
- S5+S6 SSE 라우트 + 취소·부분 실패 실측 — ⚠ 계획대로 착지, **계획의 취소 모델이 실측과 달랐다**
- S7 검증 — ❌ **실 게이트웨이 왕복 미완** — 이미지 모델 쿼터 소진(429, 리셋까지 2시간 7분)

## 가장 중요한 발견 — `openai_compatible` 프로바이더의 자격증명이 한 번도 전달되지 않았다

S2 에이전트가 "범위 밖 사전 버그"로 보고한 것을 **그대로 믿지 않고 직접 검증했다.** 결과: 사실이며, 이 작업보다 큰 문제다.

**증거 (실행해 관측)**:
- `git stash push -- src/core/config.py`로 수정을 되돌린 상태에서 `get_settings().llm`을 출력 → `openai_compatible_base_url=''`, `api_key` 미설정, `as_litellm_kwargs()['api_base']=''`. 수정 후 → `'http://192.168.0.11:20128/v1'`로 정상.
- 원인: `LLMSettings.model_config`(config.py:94-98)에 **`env_file`이 없다** — OS 환경변수만 읽고 `.env`는 못 읽는다. 그래서 루트 `Settings.llm` 프로퍼티가 명시적으로 넘겨주지 않으면 값이 사라진다. 그런데 그 프로퍼티는 openai·anthropic·gemini·azure(4필드)·ollama는 넘기면서 **`openai_compatible_*` 두 필드만 빠뜨렸고**, 애초에 루트 `Settings` 클래스에 그 필드 자체가 없었다.
- `Taskfile.yml`에 **`dotenv:` 지시자가 없고**(`grep -c dotenv` → 0) `env:`는 `PYTHONPATH: src`만 설정한다 → `task dev`로 띄워도 `.env`가 OS 환경에 올라가지 않으므로 이 경로는 정상 실행에서도 죽어 있었다.
- `.env`의 `LLM_PROVIDER=openai_compatible`이므로 **이 설정에서는 LLM 호출 경로 전체가 빈 `api_base`와 빈 키를 받고 있었다.** 나머지 다섯 프로바이더는 영향 없다(처음부터 전달됐다).

**테스트 공백이 이걸 통과시켰다.** `tests/test_config.py`는 `openai_compatible`을 `LLMSettings`를 **직접 생성해서만** 검증하고(424-452행, `TestLLMProviderRouting`), `Settings.llm` 브리지 통합 클래스(`TestLLMSettingsViaRootSettings`, 575행)에는 openai·anthropic·ollama만 있고 **`openai_compatible`이 없었다.** 깨진 이음매가 정확히 그 빈 자리다 — 이 저장소가 반복해서 겪은 "테스트가 목표와 다른 명제를 본다"의 또 한 사례다.

**그래서 회귀 가드를 직접 추가했다**: `test_llm_openai_compatible_via_settings`. `config.py` 수정을 stash한 상태에서 이 테스트만 돌려 **실제로 red가 되는 것을 확인**했고(`1 failed`), 복원 후 11 passed로 복귀했다. 7번째 프로바이더가 추가될 때 같은 누락이 재발하지 않는다.

## 방어를 깨뜨려 red를 확인한 것

다섯 에이전트 전원이 수행했고, 보고를 그대로 옮긴다:

- **S1** — `visual_description` 우선 로직을 "항상 카드 필드"로 되돌리자 `prefers_visual_description` 4건(유형별)이 정확히 red, 나머지 14건은 통과.
- **S2** — 429 특수 분기를 제거하자 한도 안내 테스트가 502를 받아 red.
- **S3** — `body["stream"] = False`를 제거하자 목 핸들러가 SSE 텍스트를 돌려주고 구현이 JSON 파싱에 실패해 2건 red. **`stream: false` 누락이 실제로 파싱을 깨뜨린다는 것을 재현했다.**
- **S4** — `_log_call` 두 곳을 제거하자 4건 전부 `0 == 1`로 red. **실 DB를 조회해** 확인했으므로 "로깅했다고 믿는데 아무것도 안 남는" 모드를 실제로 잡는다.
- **S5+S6** — ① 테넌트 가드를 무조건 통과시키자 침입자가 남의 카드에 생성 요청을 200으로 성공(가드가 실제로 404를 만든다는 확인). ② `session.commit()`을 지우자 이미지 행이 0개로 롤백(즉시 커밋이 실제로 행을 살린다는 확인).

## 발산

1. **S5+S6이 계획의 취소 모델이 틀렸음을 실측으로 밝혔다 — 이 작업에서 가장 값진 divergence다.** 계획은 "묘사 단계에서 **연결이 끊기면**" 이미지가 남는지를 핵심으로 봤다. 그런데 에이전트가 조사한 결과 **sse-starlette의 클라이언트 끊김 취소는 anyio 취소 스코프 경계에서 흡수되어 FastAPI `get_async_session`의 정리(commit-on-exit)까지 전파되지 않는다.** 즉 "즉시 커밋"이 실제로 막는 시나리오는 단순 연결 끊김이 아니라 **묘사 단계 뒤 커밋에서 진짜(취소가 아닌) 예외가 나는 경우**다. 그래서 그것을 직접 재현하는 결정론적 테스트(`test_image_row_survives_unhandled_exception_after_image_commit`)를 추가하고, 실 uvicorn 끊김 테스트도 함께 유지했다. **계획이 "shield가 있으니 괜찮다로 넘기지 말고 실측하라"고 요구한 그 지점에서 실측이 계획의 전제를 정정했다.**
2. **사건·아이템 프롬프트 매핑을 이번에 정의했다**(문서에 없었다). `worldbible_schemas.py`를 읽어 확인한 결과 `event.participants`/`occurred_at_scene`, `item.owner`는 **다른 엔티티·씬을 가리키는 UUID일 뿐 시각 정보가 아니라 제외**했다. 사건은 `description`만, 아이템은 `description`+`properties`(장소와 같은 패턴). 추측이 아니라 스키마를 읽고 정한 것이다.
3. **시각 묘사가 공백만인 경우(`"   "`)는 "주어지지 않은 것"으로 보고 카드 필드로 폴백한다** — 계획의 "주어지면 우선"을 엄격 해석한 현장 결정.
4. **S2가 litellm 경로를 실측하지 않고 `httpx.AsyncClient` 직호출로 갔다.** 계획은 "litellm이 통하는지 확인해 보고 안 되면 httpx"라고 했으나 확인을 생략했다. 근거: 저장소의 OAuth 어댑터들이 이미 httpx 패턴을 쓰고, 요청 바디를 `{model, prompt}`로 정확히 통제해 "보내면 안 되는 `n`/`seed`/`size`"를 원천 차단할 수 있다. **다만 계획이 요구한 실측을 건너뛴 것은 사실이므로 기록한다** — litellm 경로가 더 나은지는 미확인.
5. **S3이 시그니처를 `describe_image(data, *, client=None)`로 확장했다.** 계획의 `describe_image(data: bytes) -> str`로는 실 네트워크 없는 목 테스트가 불가능했고, 저장소에 `respx` 같은 목 라이브러리가 없어 이미 설치된 `httpx.MockTransport`를 DI로 주입하는 최소 확장을 택했다. 기본값 `None`이라 운영 호출부는 인자 없이 그대로 쓴다.
6. **S3이 오류 상태 코드를 502로 통일했다**(계획에 없던 결정). 운영 LLM 오류를 정책 거절과 명확히 분리하려는 선택이다.
7. **S3이 작성 시점에 S2 파일이 아직 없어 `vision_describe.py`를 독립 파일로 만들었다.** 계획은 "더 게으르면 S2 모듈과 합치라"고 했는데 병렬 실행이라 합칠 대상이 없었다. 두 모듈이 `httpx.AsyncClient` 호출 패턴을 공유하므로 **병합 검토가 후속 후보다.**
8. **S4가 테스트 작성 중 부수 함정을 하나 발견해 테스트를 고쳤다**(구현은 무변경). `asyncio.create_task`를 모듈 경로로 monkeypatch하면 전역 `asyncio` 모듈이 패치되어, patch 블록 안에서 코루틴을 await할 때 SQLAlchemy `AsyncSession.__aexit__`의 `create_task(self.close())`까지 가짜가 되고 "coroutine never awaited" 경고가 났다. 캡처한 코루틴을 블록 밖에서 await하도록 순서를 바꿔 해결. `tests/chat/test_llm_client.py`의 동일 패턴은 `save_llm_call_log`를 통째로 목해서 이 문제를 안 겪는다.
9. **S1 에이전트가 `git checkout` 실수로 구현을 한 번 원복했다가 재적용했다**(테스트 파일은 영향 없음). 최종 상태는 정상.

## 통합 검증 결과

- `uv run ruff check .` → All checks passed · `ruff format` → 1파일 정리 후 클린 · `uv run mypy src` → **171 files, no issues**.
- `uv run pytest -q` → **1053 passed, 1 skipped**, 커버리지 **80.66%**(≥70). #76 시점의 1010에서 +43.
- 기존 실패 **12건 불변** — `TestMakefileHotReload` 9 + `TestMakeMigrate` 3. #76 실행에서 `git stash`로 이번 변경을 치운 상태에서도 동일하게 실패함을 관측해 무관함을 이미 입증했다(원인: `Makefile` 부재, 프로젝트가 Taskfile로 이전).

## 남은 것 — S7의 실 게이트웨이 왕복

계획의 DoD는 `curl -N`로 SSE를 걸어 **이미지 파일과 시각 묘사가 카드에 붙고 `llm_calls`에 두 행이 남는 것**까지를 요구한다. 이미지 모델 쿼터가 소진돼(429, 게이트웨이가 리셋까지 남은 시간을 명시: 측정 시점 **2시간 7분**) 성공 경로를 실호출로 확인할 수 없다. **채팅·비전 모델은 정상 동작하므로 비전 역번역 쪽은 실호출이 가능하다**(방금 200 확인).

쿼터 회복 후 확인할 것:
1. `POST /api/v1/works/{work_id}/entities/{entity_id}/images` (SSE)에 `curl -N` → 단계 이벤트가 `프롬프트 조립 → 이미지 생성 → 묘사 → 완료` 순으로 흐르고 `[DONE]`으로 끝나는가.
2. 끝난 뒤 그 카드에 이미지 파일이 저장되고 `visual_description`이 채워졌는가(DB 조회).
3. `llm_calls`에 `task="image_generation"`·`"image_description"` 두 행이 남았는가.
4. 중간에 연결을 끊으면 이미지는 남고 묘사는 null인가.
5. 첫 이미지가 자동으로 [[대표 이미지]]가 되고 두 번째는 대표를 바꾸지 않는가.

## 후속 작업 후보

- **`openai_compatible` 자격증명 누락은 이 작업의 부수 수정으로 끝났지만, 그 사실 자체는 별도로 알릴 값이 있다** — 이 설정으로 개발해 온 기간 동안 LLM 기능이 실제로 어떻게 동작했는지(다른 프로바이더로 QA했는지, 셸에서 export했는지) 확인이 필요하다.
- **`vision_describe.py`와 `image_gateway.py` 병합 검토** — 둘이 같은 `httpx.AsyncClient` 호출 패턴을 중복한다(위 발산 7).
- **`litellm.aimage_generation` 경로 실측** — httpx 직호출로 갔으므로 미확인(위 발산 4).
- **429 한도 안내가 3/3의 UI에 어떻게 드러나야 하는가** — S2가 백엔드에서 정직한 안내로 매핑했으니, 웹이 그것을 시스템 오류가 아닌 안내로 표시해야 한다.
