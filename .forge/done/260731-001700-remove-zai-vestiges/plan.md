<!-- forge-slug: remove-zai-vestiges -->
<!-- task: 63 -->
<!-- tdd: on -->
<!-- priority: medium -->
# z.ai 잔재 제거 — 죽은 thinking 파라미터와 stale 문서 정리

## Goal / Non-goals
- Goal: LLM 프로바이더를 z.ai/GLM에서 OpenAI 호환 라우터로 옮긴 뒤 남은 **z.ai 전용 잔재**를 걷어낸다. ① `get_fast_writing_client()`의 z.ai 전용 `extra_body={"thinking":{"type":"disabled"}}`와 그 근거 주석 제거 ② 함수는 유지하되 docstring을 "지연에 민감한 태스크를 빠른 모델로 분리할 자리"로 재작성 ③ `config.py`·`.env.example`의 z.ai 예시·기본값을 현재 구성에 맞게 갱신 ④ `embedding_client.py`의 z.ai 언급을 근거는 남기고 프로바이더 중립 문구로 고침.
- Non-goals: **`extraction_service.py`의 코드펜스 방어 로직을 지우지 않음** — 주석이 "GLM-4.6 등"이라 z.ai 전용처럼 보이지만 실제로는 일반적 방어이고 현재 모델도 코드펜스를 쓴다. 주석 문구만 프로바이더 중립으로 일반화한다 · **`get_fast_writing_client()` 함수를 삭제하지 않음**(사용자 선택 — 아래 결정 참조) · 호출부(`assist_router.py`·`manuscript_router.py`의 `_*_llm_client` 의존성 5~6곳) 무변경 · `TASK_TIER` 표·`_TIER_FACTORY_GETTERS` 무변경 · fast 티어를 별도 모델로 라우팅하는 기능(`LLM_FAST_MODEL` 등) 추가하지 않음 · `.env`(실제 로컬 설정) 무변경 — 이미 새 엔드포인트로 전환됨 · web 무변경
- 참고: 후보 형식 파싱은 별도 작업 **#62 `assist-candidate-format-contract`**가 다룬다. 이 작업은 형식·파서를 건드리지 않는다.

## Source of truth
- Glossary terms: **품질 티어 (Quality Tier)** in `.forge/CONTEXT.md` — "사용자가 작품에 적용하는 생성 품질(저비용/균형/고품질)이며 사용자는 모델명·API 키를 직접 다루지 않는다". `get_fast_writing_client`는 이 개념을 코드에서 표현하는 자리이므로 **이름과 존재를 지키는 것이 글로서리와 정합**한다(z.ai 전용 구현 수단만 걷어낸다).
- Related ADRs: `0004-user-llm-setting-as-quality-tier.md`(품질 티어 결정) · `0012-ai-chapter-title-as-assist-task.md`(assist 태스크가 이 클라이언트를 공유). **새 ADR 없음** — 죽은 파라미터 제거와 주석 갱신은 되돌리기가 싸고 3조건 게이트를 통과하지 못한다.
- 착수 전 조사·측정으로 확정된 사실:
  - **`extra_body`는 실제로 죽었다** — 새 엔드포인트에 `thinking={"type":"disabled"}`를 실어 호출해도 HTTP 200으로 **조용히 무시**된다(2026-07-29 실측). 이 라우터는 thinking 끄기를 `no-think/<model>` **모델명 접두**로 표현하므로 파라미터 방식이 통하지 않는다.
  - **근거 주석이 사실과 어긋난다** — `tier_routing.py:98`의 "z.ai GLM-4.6은 기본적으로 확장 추론(thinking) 모드로 동작해 … 실측: thinking 켜짐 46~67초"는 z.ai 시절의 측정이고 현재 프로바이더와 무관하다.
  - **함수는 티어 표의 별칭이 아니다** — `TASK_TIER`는 `dialogue`·`style`을 `high_quality`로 규정하는데 `assist_router`의 `_dialogue_llm_client()`는 `get_fast_writing_client()`를 쓴다(표를 의도적으로 우회). 즉 이 함수는 "지연을 줄이려는 의도적 우회"이며, 삭제하면 그 의도가 사라진다.
  - **오늘은 동작이 동일하다** — `_TIER_FACTORY_GETTERS`의 두 티어 모두 `get_llm_factory`를 가리키므로(`# eco: single real provider today` 주석), `extra_body` 제거 후 `get_fast_writing_client()`는 기본 클라이언트와 같아진다. 따라서 이 작업으로 **런타임 동작은 바뀌지 않는다**(생성 결과·지연 모두).
  - **`extraction_service.py`는 z.ai 전용이 아니다** — 코드펜스로 감싼 JSON을 벗기는 방어는 현재 모델에도 필요하다. 로직 삭제는 회귀다.
  - z.ai 언급 위치 전수(트리 전체 grep): `tier_routing.py:9,98,106` · `embedding_client.py:4` · `config.py:50,165(주석),169(description 예시 URL)` · `.env.example` 4곳(그중 `:255`는 `OPENAI_COMPATIBLE_BASE_URL`의 z.ai 기본값) · `extraction_service.py`(주석만, 로직 보존).
- 결정 요약(그릴링 합의):
  - **`get_fast_writing_client()`는 유지하고 docstring만 재작성한다.** 삭제하면 호출부 5~6곳을 바꿔야 하고, 티어 표가 `dialogue`·`style`을 `high_quality`로 되돌려 **나중에 진짜 고품질 모델을 배선하는 순간 그 태스크들이 조용히 느려지거나 비싸진다**. 지금은 동작이 같으니 seam을 남기는 편이 안전하다. 저장소에 이미 `# eco: single real provider today` 식으로 seam을 주석으로 표시하는 관례가 있다.
  - **`extra_body` 제거는 동작 무변경**이므로 회귀 테스트의 초점은 "제거 후에도 그 경로가 정상 동작한다"에 둔다(파라미터가 사라졌는지 단정하는 테스트를 새로 만들 필요는 낮다 — 다만 아래 완성기준 ①로 최소 1건 고정한다).
  - **`.env.example`은 z.ai 예시를 지우고 현재 구성(OpenAI 호환 라우터)을 예시로 바꾼다.** 단 **실제 키·내부 IP를 예시 파일에 쓰지 않는다** — 자리표시자를 쓴다(`.env.example`은 git-tracked).
- Definition of Done:
  - `grep -rn "z\.ai\|GLM" api/src api/.env.example`의 결과가 **`extraction_service.py`의 일반화된 주석 외에는 없다**(또는 0건).
  - 이어쓰기·인필링·대사 변환·기획의도 이어쓰기가 여전히 정상 동작한다(브라우저 육안 — 동작 무변경이 목표이므로 회귀만 본다).
  - api `task lint`(ruff+mypy) 통과, `task test`에서 이번 변경으로 인한 신규 실패 0(Makefile 부재로 인한 기존 실패 12건은 무관).
  - `.env.example`에 실제 키·내부 IP가 들어가지 않는다.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 죽은 `extra_body` 제거 + docstring 재작성 — `tier_routing.py`의 `get_fast_writing_client()`에서 `model_kwargs={"extra_body": {...}}`를 제거해 인자 없는 `LLMClient()`를 반환하게 하고, z.ai 실측 근거 주석(`:98` 일대)을 "지연에 민감한 태스크(이어쓰기·인필링·대사 변환·기획의도 이어쓰기)를 빠른 모델로 분리할 자리 — 현재는 기본 클라이언트와 동일" 취지로 재작성한다. 모듈 docstring(`:9`)의 "z.ai GLM-4.6" 언급도 프로바이더 중립으로 고친다. 호출부·티어 표는 건드리지 않는다. — completion criterion: pytest — ① `get_fast_writing_client()`가 반환한 클라이언트에 z.ai 전용 `extra_body`/`thinking` 키가 **없다**, ② 그 클라이언트로 기존 assist 경로 테스트(이어쓰기·인필링·대사 변환)가 green 유지, ③ `uv run mypy`·`ruff`가 해당 파일에서 clean. (depends: none)
- [ ] S2. stale 문서·기본값 정리 — `config.py`의 `openai_compatible` 설명과 `openai_compatible_base_url`의 `description` 예시에서 z.ai URL을 제거하고 프로바이더 중립 문구로 바꾼다. `embedding_client.py:4`는 **근거를 보존하면서** 프로바이더 중립으로 고친다(예: "LLM 프로바이더가 임베딩 엔드포인트를 제공하지 않아 로컬 모델로 실행한다 — 프로바이더와 무관하게 API 키가 필요 없다"). `.env.example`의 z.ai 예시 4곳을 OpenAI 호환 라우터 예시로 교체하되 **자리표시자만** 쓴다. `extraction_service.py`의 "GLM-4.6 등" 주석은 프로바이더 중립으로 일반화하고 **로직은 그대로 둔다**. — completion criterion: ① `grep -rn "z\.ai\|GLM\|glm" api/src api/.env.example`가 0건(또는 일반화된 주석만), ② `.env.example`에 `sk-`로 시작하는 값이나 `192.168.` IP가 없다, ③ `api/src`에서 `LLMSettings`가 여전히 `.env`를 읽고 `openai_compatible` 프로바이더가 정상 동작한다(기존 config 테스트 green). (depends: none — S1과 다른 파일이라 병렬 가능)

## 검증 노트 (직전 회고 반영)
- **소비자를 트리 전체에서 grep해 확정했다** — `get_fast_writing_client`의 호출부는 `assist_router.py`(continue·infill·dialogue 등)와 `manuscript_router.py`(기획의도 이어쓰기)의 의존성 함수들이다. #61에서 파일 두 개만 grep하고 "확인했다"고 써서 세 번째 소비자를 놓친 전례가 있어 이번엔 전수 결과를 위에 적었다.
- **동작 무변경이 목표다** — 그래서 UAT는 "새 기능이 되는가"가 아니라 **"기존 경로가 안 깨졌는가"**를 본다. 이어쓰기·인필링·대사 변환·기획의도 이어쓰기 네 경로를 각각 한 번씩 돌려보는 것으로 충분하다.
- **삭제 유혹을 비목표로 못박았다** — `extraction_service.py`의 코드펜스 방어는 z.ai 전용처럼 보이지만 아니다. 주석만 보고 로직을 지우는 것이 이 작업의 가장 그럴듯한 사고다.
- `.env.example`은 git-tracked이므로 **실제 키·내부 IP를 쓰면 시크릿·인프라 노출**이다. 자리표시자 사용을 완성기준에 넣었다.
