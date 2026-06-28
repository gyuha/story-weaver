# run — chat LLM: OpenAI 호환 provider 추가 (z.ai/GLM)

slug: llm-openai-compatible-provider · 실행일: 2026-06-28 · 워크플로우: 미사용(직접 실행, TDD on)

## 실행 방식

config 중심의 작은 작업이라 직접 실행. auth/works와 달리 LLM 라우팅이 3곳에 분산돼 있어(config `as_litellm_kwargs`/`litellm_model`, chat `ProviderFactory.make_model_string`, infra `make_chat_litellm`) 먼저 live 경로를 확인 — `make_kwargs`가 `as_litellm_kwargs()`에 위임하므로 **config가 kwargs 단일 출처**임을 확인하고 거기에 분기 추가.

## 계획대로 된 것

- **슬라이스 1** — `core/config.py`: `LLMProvider.openai_compatible` enum 추가, `openai_compatible_base_url`(alias `OPENAI_COMPATIBLE_BASE_URL`)·`openai_compatible_api_key`(alias `OPENAI_COMPATIBLE_API_KEY`) 필드, `litellm_model`(→`openai/<model>`)·`active_api_key`·`as_litellm_kwargs`(api_base+api_key 분기) 갱신. TDD: openai_compatible의 litellm_model·kwargs·active_api_key 단위 테스트 추가.
- **슬라이스 2** — infra `make_chat_litellm`가 openai_compatible kwargs(`openai/glm-4.6`·코딩 base URL·키)를 ChatLiteLLM에 전달하는지 테스트(patch, 네트워크 없음). `.env.example`에 openai_compatible 섹션 + z.ai 코딩 예시 추가.

## 계획과 다른 것 (divergence — 낮음)

- **라우팅 분산 발견**: 계획은 config.py만 언급했으나, chat `ProviderFactory.make_model_string`도 `{provider}/{model}`을 만들어 openai_compatible에 대해 `openai_compatible/glm-4.6`(오작동)을 낼 것이라, azure처럼 특수 분기(`openai/<model>`)를 추가해 config와 일치시킴. live kwargs 경로는 config에 위임돼 있어 핵심 정확성엔 영향 없었지만 일관성을 위해 정정.
- `test_all_provider_values_in_enum`의 고정 집합에 `openai_compatible` 추가(내 변경이 provider를 추가했으므로). `supported_providers` 테스트는 enum에서 동적 파생이라 무수정.
- **환경 quirk(무관)**: chat 테스트만 단독 수집 시 langchain_core→pydantic v1이 Python 3.14 비호환 UserWarning을 내고 `filterwarnings=error`로 승격돼 import 실패. 전체 스위트에선 정상 통과(수집 순서 artifact). 내 변경과 무관, 선존.
- 선존 Makefile 테스트 12건 실패(test_dev_server/test_migrations) — Taskfile 이전 잔재, 무관.

## 검증 (UAT)

- `uv run pytest -q` → **641 passed**, 1 skipped, 커버리지 **74.45%**(게이트 70% 통과). openai_compatible config 테스트 3건 + factory 테스트 1건 포함 green.
- `uv run ruff check`(변경 파일) 통과 · `uv run mypy src` Success(59 files).
- **라이브 미수행**: z.ai 실제 호출은 비밀키 필요(테스트/레포 제외) — 사용자가 `.env`에 4줄 설정 후 `task serve`로 확인(설정법은 .env.example + 핸드오프에 안내).
