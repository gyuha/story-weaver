<!-- forge-slug: remove-zai-vestiges -->
<!-- task: 63 -->
# RUN — z.ai 잔재 제거 (죽은 thinking 파라미터 + stale 문서)

실행 형태: **직접 실행(워크플로우 아님).** 5파일의 죽은 코드 1줄 + 주석·문구 교체라 병렬 이득이 없다.
모드: `tdd: on`, `eco: on`. `Run all` 배치의 3/3(마지막) — #64 → #62 → **#63**.

## 계획대로 된 것

- **S1 죽은 `extra_body` 제거(test-first)** — 기존 `test_get_fast_writing_client_disables_thinking_mode`를 반전시켜 `test_get_fast_writing_client_sends_no_provider_specific_params`로 다시 썼다(`"thinking" not in str(kwargs)` + `model_kwargs in (None, {})`). **먼저 붉은 상태를 확인**(1 failed)한 뒤 `LLMClient(model_kwargs=...)` → `LLMClient()`로 고쳐 green(12 passed).
- **S1 docstring 재작성** — z.ai 실측 근거("46~67초 → 9~12초")를 걷어내고, 이 함수가 **`TASK_TIER`를 의도적으로 우회하는 seam**이라는 사실과 "현재는 기본 클라이언트와 동일 · 빠른 모델을 붙일 때 여기만 고친다"를 남겼다. 모듈 docstring의 "z.ai GLM-4.6"도 프로바이더 중립으로 바꿨다.
- **S2 stale 문구 4파일** — `config.py` 2곳(`openai_compatible` 설명 · `base_url` description 예시 URL → `https://<host>/v1` 일반형), `embedding_client.py`(근거 보존: "임베딩 엔드포인트를 제공하지 않는 프로바이더도 있으므로 프로바이더 구성과 무관하게 동작하도록 분리"), `.env.example` 2곳(자리표시자 `https://your-endpoint.example.com/v1` · `your-model-name`), `extraction_service.py` 주석 1곳("일부 모델(GLM-4.6 등)" → "일부 모델").
- **비목표 무침범** — `extraction_service.py`의 코드펜스 방어 **로직은 그대로**(주석만 일반화) · `get_fast_writing_client()` 함수 유지 · 호출부 5~6곳 무변경 · `TASK_TIER`·`_TIER_FACTORY_GETTERS` 무변경 · `LLM_FAST_MODEL` 류 신규 기능 없음 · `.env`(실제 로컬 설정) 무변경 · web 무변경 · 새 ADR 없음.

## 도중에 내린 결정 (플랜이 방법을 열어둔 부분)

- **S1 테스트는 "없음"을 직접 단정하는 쪽으로 만들었다.** 플랜은 "파라미터가 사라졌는지 단정하는 테스트를 새로 만들 필요는 낮다"고 봤지만, 기존 테스트가 정확히 그 반대를 단정하고 있었으므로 **어차피 고쳐야 했다** — 삭제보다 반전이 맞다. 왜 없어야 하는지(현재 프로바이더가 조용히 무시 → 남기면 "동작하는 설정"으로 오독)를 docstring에 적어 회귀 방지 근거를 테스트에 붙였다.
- **`.env.example`의 base URL 설명에 "/v1 경로를 포함해야 한다"를 명시했다.** 이번 프로바이더 전환에서 실제로 걸린 지점이라(엔드포인트가 `/v1`까지 요구) 자리표시자만 바꾸는 것보다 낫다.

## 계획과 달라진 것 (divergence)

- **없음.** 두 슬라이스가 계획 그대로, 파일도 플랜이 전수 grep으로 적어둔 위치와 정확히 일치했다(`tier_routing.py:9,98,106` · `embedding_client.py:4` · `config.py` 2곳 · `.env.example` 2곳 · `extraction_service.py` 주석). #61의 "소비자를 다 grep했다고 쓰고 놓친" 실수가 이번엔 재발하지 않았다 — 플랜 작성 시점의 전수 grep이 실제로 값을 했다.

## 최종 게이트 (직접 재실행)

- **DoD ①** `grep -rni "z\.ai\|GLM" api/src api/.env.example` → **0건**(일반화된 주석조차 해당 문자열을 남기지 않았다).
- **DoD ③** `uv run ruff check src tests` → All checks passed! · `uv run mypy src` → Success (159 files) · `uv run pytest` → **929 passed, 1 skipped, 12 failed** — 실패 12건은 전부 `tests/test_dev_server.py`·`tests/test_migrations.py`의 `Makefile` 부재(Taskfile로 이전된 사전 존재 실패)로 **이번 변경으로 인한 신규 실패 0**.
- **DoD ④** `.env.example`에 실제 키·내부 IP 없음(`sk-ant-...`는 사전 존재 자리표시자).
- **DoD ②** 브라우저 육안 회귀 — 아래 UAT에서 확인.

## 막혔던 곳 / 환경 이슈

- 없음.
- **여전히 미커밋** — `0a03f36` 이후 #60·#61·#62·#64·#63 코드와 `.forge` 문서·ADR·`.env`가 모두 쌓여 있다.

## 후속 작업 후보

- **`Makefile` 참조 테스트 12건 정리** — `Taskfile`로 이전됐는데 테스트가 `Makefile`을 읽는다. 이 작업과 무관하지만 매 실행마다 실패 12건이 노이즈로 남아 "신규 실패 0" 판정을 사람이 손으로 해야 한다.
- 빠른 모델을 실제로 배선할 때 `get_fast_writing_client()`의 seam을 채우기(현재는 기본 클라이언트와 동일).
