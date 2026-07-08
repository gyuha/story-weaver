<!-- forge-slug: llm-openai-compatible-provider --><!-- task: 20 --><!-- tdd: on -->

# chat LLM: OpenAI 호환 provider 추가 (z.ai/GLM 코딩 엔드포인트 지원)

## Goal

chat 도메인이 임의의 **OpenAI 호환 엔드포인트**를 LLM provider로 쓸 수 있게 `openai_compatible` provider를 추가한다. 1차 사용처는 z.ai 코딩 요금제(`https://api.z.ai/api/coding/paas/v4`, 모델 `glm-4.6`)지만, base_url·api_key·모델은 전부 설정값이라 다른 호환 엔드포인트에도 그대로 쓸 수 있다(z.ai 전용 아님).

## Source of truth (decisions·refs)

- 기존 LLM 설정 단일 출처: `api/src/core/config.py`(`LLMProvider`, `LLMSettings.as_litellm_kwargs`/`litellm_model`/`active_api_key`)와 `api/src/infra/llm/provider_factory.py`(`make_chat_litellm` — `ChatLiteLLM` 생성 유일 지점).
- ADR-0003(상용 LLM 하이브리드)·ADR-0004(품질 티어) — LLM 전략 맥락.
- z.ai: OpenAI 호환 `/chat/completions`, 인증 `Authorization: Bearer <key>`, 코딩 엔드포인트 `https://api.z.ai/api/coding/paas/v4` (docs.z.ai 확인).

## Decisions

- **범용 `openai_compatible` provider** (z.ai 전용 아님): litellm의 OpenAI 호환 경로로 라우팅 — `model="openai/<default_model>"` + `api_base`=설정 base_url + `api_key`=설정 키. litellm 내장 `zhipuai/`를 쓰지 않는 이유: 그 경로는 z.ai 일반 엔드포인트로 가서 코딩 요금제 URL을 못 쓰고, 범용성도 없음.
- 기존 `openai` provider(api.openai.com)는 **변경하지 않음** — 별도 env로 공존.
- base_url·api_key·모델은 **설정값**(하드코딩 금지). 모델 기본 예시 = `glm-4.6`.
- ADR 미작성 — provider 추가는 가역적 config라 ADR 게이트(되돌리기 어려움) 미통과. 근거는 본 Decisions에 기록.

## Slices

### 1. config: openai_compatible provider (TDD)

- `LLMProvider`에 `openai_compatible` enum 값 추가.
- 신규 필드: `openai_compatible_base_url`(alias `OPENAI_COMPATIBLE_BASE_URL`), `openai_compatible_api_key`(alias `OPENAI_COMPATIBLE_API_KEY`, SecretStr).
- `litellm_model`: openai_compatible → `openai/<default_model>`.
- `active_api_key`: openai_compatible 키 매핑 추가.
- `as_litellm_kwargs`: openai_compatible 분기 — `api_base`=base_url, `api_key`=키.
- 테스트 우선: openai_compatible의 `as_litellm_kwargs()`가 `{model: "openai/glm-4.6", api_base: "https://api.z.ai/api/coding/paas/v4", api_key: <키>, ...}` 반환 확인 + `litellm_model` 확인 + base_url 미설정 시 동작(빈 값) 확인. 기존 provider(openai/anthropic/gemini/azure/ollama) 회귀 테스트 유지.
- **완료 기준**: `task test` 통과(커버리지 70% 유지), `task lint`(ruff+mypy strict) 통과.

### 2. provider_factory 검증 + .env 문서화

- `make_chat_litellm`가 openai_compatible 설정으로 올바른 kwargs를 `ChatLiteLLM`에 넘기는지 테스트(기존 패턴대로 `ChatLiteLLM` patch, 네트워크 없음).
- `.env.example`에 openai_compatible 섹션 추가 — z.ai 코딩 예시 포함:
  ```
  LLM_PROVIDER=openai_compatible
  LLM_DEFAULT_MODEL=glm-4.6
  OPENAI_COMPATIBLE_BASE_URL=https://api.z.ai/api/coding/paas/v4
  OPENAI_COMPATIBLE_API_KEY=<z.ai 코딩 요금제 키>
  ```
- **완료 기준**: `task test`·`task lint` 통과. `.env.example`에 설정법이 다른 provider 예시와 같은 형식으로 들어감.

## 검증 경계

- **봉인 게이트 = 단위 테스트**(kwargs 정확성·회귀). z.ai 실제 호출은 비밀키가 필요해 테스트/레포에 넣지 않는다.
- 라이브 확인(선택, 사용자 수행): `.env`에 위 4줄 설정 → `task serve` → `/docs`의 chat 엔드포인트 또는 `task smoke-test`로 실제 GLM 응답 확인.

## Non-goals (이번에 안 함)

- 품질 티어 → 모델 매핑(ADR-0004, 추후·현재 mock)
- 기존 provider(openai/anthropic/gemini/azure/ollama) 동작 변경
- 프론트엔드 연동
- 실제 API 키 커밋(.env는 gitignore, 예시만 .env.example)
- 모델명 하드코딩(설정값 유지)
- z.ai 전용 provider(범용 openai_compatible로 일반화)
