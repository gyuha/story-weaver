<!-- forge-slug: entity-setting-image-2of3 -->
<!-- task: 77 -->
<!-- part: 2/3 -->
<!-- tdd: on -->
# 설정 이미지 (2/3): 프롬프트 조립 · 게이트웨이 생성 · 비전 역번역 · SSE 라우트

## 목표 / 비목표

- 목표: 실제로 이미지를 만든다 — [[엔티티 카드]] 4종의 필드를 [[이미지 템플릿]]과 합쳐 프롬프트를 조립하고, 게이트웨이 `/v1/images/generations`로 호출해 파일로 저장하고, 그 이미지를 비전 모델에 되먹여 [[시각 묘사]]를 뽑아 채운다. 이 4단계를 SSE 이벤트로 흘리고 두 LLM 호출을 `llm_calls`에 기록한다. **`curl`만으로 카드에 이미지가 붙는 것까지 끝난다** — 웹은 3/3.
- 비목표: 웹 배선 일체(3/3). 레퍼런스 이미지 업로드·캐릭터 LoRA(ADR `260811-234512`가 왜 불가한지 기록했다). 이미지 모더레이션 — ADR `260730-070532`가 연령·수위 제한을 제거했고 `image_generation_service.py:9-11`이 이미 그 근거로 정책 필터를 두지 않는다고 적어뒀다. [[품질 티어]] 연동(호출 가능한 이미지 모델이 하나뿐). 개별 이미지 삭제. 묘사 전용 재시도 엔드포인트(ADR `260811-234512`가 명시적으로 배제 — 다시 만들려면 재생성한다).

## 진실의 출처

- 글로서리 용어: **설정 이미지 · 이미지 템플릿 · 대표 이미지 · 시각 묘사** (`.forge/CONTEXT.md`).
- 관련 ADR: `260811-234511`(게이트웨이 엔드포인트·모델명·실측 제약표·SSE를 고른 이유), `260811-234512`(비전 역번역이 유일한 일관성 수단인 이유, **이미지 먼저 커밋 → 묘사 뒤에 채움** 순서, 묘사 null 허용), ADR-0009(LLM 호출 기록), `260801-014029`(취소된 생성도 사용량은 과금 — 취소 시 기록을 남기는 근거), ADR-0005(테넌트 스코프).
- 참고 문서: `docs/image-generation.md` 3.1·3.2 매핑표(인물=외모만, 장소=환경·분위기·양식). **사건·아이템 매핑은 문서에 없다** — 이번에 정한다(사건=참여자·묘사·발생 시점 중 시각 정보만 / 아이템=묘사·속성).
- 기존 코드: `image_generation_service.py`(인물·장소 매핑 함수 2개 — 확장 대상), `infra/llm/provider_factory.py`(`ChatLiteLLM`만 만든다 — **이미지 경로는 여기 없다**), `domains/assist/router/assist_router.py:329-390`·`domains/manuscript/router/manuscript_router.py:225`(`EventSourceResponse` + `[DONE]` sentinel 선례), `core/llm_call_context.py`·`domains/chat/models/llm_call_log.py:29-43`(로깅).
- Definition of Done: `curl -N`로 SSE 생성을 걸면 단계 이벤트가 순서대로 흐르고, 끝나면 그 카드에 이미지 파일과 [[시각 묘사]]가 붙어 있으며, `llm_calls`에 `task="image_generation"`·`"image_description"` 두 행이 남는다. 중간에 연결을 끊으면 **이미지는 남고 묘사는 null**이다.

## 작업 조각

- [ ] S1. 4종 유형별 프롬프트 조립 (TDD) — completion criterion: 인물·장소·사건·아이템 각각의 카드 필드를 **시각 정보만** 추려 템플릿의 `prompt_suffix`와 결합한 프롬프트 문자열을 만든다. 인물은 `외모`만 반영하고 `성격`·`말투`·`관계`는 넣지 않는다(`image-generation.md` 3.1 — 넣으면 노이즈). 작가가 준 추가 지시가 있으면 뒤에 붙는다. [[시각 묘사]]가 이미 있으면 **그것을 카드 필드보다 우선해 쓴다** — 재생성 일관성의 전부가 여기 걸려 있다(ADR `260811-234512`). 유형 4종 × (묘사 있음/없음) 조합을 단정하는 pytest.

- [ ] S2. 게이트웨이 이미지 생성 어댑터 (TDD) — completion criterion: `POST {OPENAI_COMPATIBLE_BASE_URL}/v1/images/generations`에 `model=antigravity/gemini-3.1-flash-image`로 보내 `b64_json`을 디코드한 바이트를 돌려준다. **`n`·`seed`·`size`를 보내지 않는다** — ADR `260811-234511`의 표대로 각각 400·무효·비율 힌트라서 보내면 오해를 만든다. 타임아웃은 60초로는 부족하다(실측 18~60초, 한 번은 60초 초과) — 넉넉히 잡고 그 값에 근거 주석을 남긴다. 호출 실패·비-200을 `AppError`로 바꾼다. **실 네트워크를 타지 않는 pytest**(HTTP 목)로 고정하되, 착수 시 실호출 1회로 게이트웨이가 살아 있는지 먼저 확인한다.

- [ ] S3. 비전 역번역 어댑터 (TDD) — completion criterion: 저장된 이미지를 `data:image/jpeg;base64,...`로 실어 `auto/best-vision` 모델에 chat completions로 보내고, 얼굴·머리·체형·복장·색상을 담은 한국어 [[시각 묘사]] 문자열을 돌려준다. **`stream: false`를 명시한다** — 그릴링 중 실측에서 이 게이트웨이는 `stream` 미지정 시 SSE(`data: {...}`)로 응답했고, 그대로 `json.loads`하면 깨진다. pytest(HTTP 목).

- [ ] S4. 두 호출의 `llm_calls` 기록 (TDD) — completion criterion: 이미지 생성과 비전 묘사가 각각 `task="image_generation"`·`"image_description"`으로 `llm_calls`에 남는다(`model`·`provider`·`latency_ms`·`error`). 이미지 생성은 `ChatLiteLLM`을 타지 않으므로 **자동 로깅이 붙지 않는다** — 직접 붙였는지를 단정하는 테스트가 필요하다. `messages`가 NOT NULL이므로 프롬프트를 합성 메시지 한 건으로 넣고, `response`·토큰은 null로 둔다(`llm_call_log.py:38-43`에서 확인). 실패·취소한 호출도 `error`와 함께 남는다(ADR `260801-014029`의 정신). (depends: S2, S3)

- [ ] S5. SSE 생성 라우트 (TDD) — completion criterion: `POST /api/v1/works/{work_id}/entities/{entity_id}/images` (SSE)가 `프롬프트 조립 → 이미지 생성 → 묘사 → 완료` 단계 이벤트를 흘린다. **이미지가 나오는 즉시 파일 저장 + DB 커밋 + 이미지 이벤트 발행**을 하고 **그 다음에** 묘사를 뽑아 UPDATE한다(ADR `260811-234512`) — 순서가 뒤바뀌면 취소 시 2분과 호출 보사가 날아간다. 카드의 첫 이미지는 자동으로 [[대표 이미지]]가 되고, 두 번째부터는 대표를 바꾸지 않는다. 남의 `work_id`면 404(ADR-0005). `EventSourceResponse` + `[DONE]` sentinel은 `assist_router.py`와 같은 어휘. (depends: S1–S4)

- [ ] S6. 취소·부분 실패의 실측 고정 (TDD) — completion criterion: **묘사 단계에서 연결이 끊기거나 오류가 나도 이미지 행과 파일이 남고 `visual_description`이 null**임을 단정하는 테스트. `summary-draft` 회고의 4번째 함정이 정확히 이 자리다 — `vi.fn()`류 목은 "불렸다"만 알려주고 실제 부작용(커밋됐는지)을 재현하지 않으므로, **DB를 실제로 조회해 행과 파일을 확인**한다. 그리고 anyio 취소 스코프에서 커밋이 실제로 살아남는지는 "shield가 있으니 괜찮다"로 넘기지 않고 실측한다(#66이 그 이유로 틀렸다). (depends: S5)

- [ ] S7. 검증 — completion criterion: `cd api && task lint` 클린, `task test` 통과(커버리지 ≥70, 새로 깨진 것과 원래 깨져 있던 것을 구분해 기록). **실 게이트웨이로 `curl -N` 왕복 1회**: 이벤트 순서 확인 → 카드에 이미지·묘사가 붙었는지 DB 조회 → `llm_calls` 두 행 확인 → 연결을 중간에 끊고 이미지만 남는지 확인. (depends: S1–S6)

## 검증 노트 (이 플랜의 사실 주장은 어떻게 확인됐나)

**그릴링 중 실호출로 관측한 것** (2026-08-11, 게이트웨이 `192.168.0.11:20128`):

- 생성 성공: `model=antigravity/gemini-3.1-flash-image` → 200, `b64_json` JPEG **1024×1024**(JFIF 헤더·SOF 마커에서 폭·높이 파싱해 확인). 한국어 프롬프트 18.3초/683KB, 영어 프롬프트 871KB. 두 이미지를 눈으로 확인했고 "수묵화풍·전신 입상·흰 배경" 구도 지시가 그대로 반영됐다 — **템플릿의 `prompt_suffix`가 효과가 있다는 직접 증거이며 S1의 전제다.**
- `images/edits` 400 / `seed` 무효(같은 seed 2회의 b64 sha256이 다름) / `n=2` 400 / `size` 비율만 / `revised_prompt` 에코 → ADR `260811-234511`의 표. **S2가 이 파라미터들을 보내지 않는 근거.**
- 비전 역번역 성공: `auto/best-vision` → 실제로 `gpt-5.6-sol`로 라우팅되어 1,500자 이상의 한국어 상세 묘사 반환. **S3의 전제.**
- `stream` 미지정 시 SSE로 응답했다 → `antigravity/gemini-3.1-flash-image`에 chat completions를 걸었을 때 응답이 `data: {...}` 청크였다. **S3가 `stream: false`를 명시하는 근거.**
- `llm_calls` 컬럼 구성(`messages` NOT NULL, `response`·토큰 nullable, `task` 존재) → `llm_call_log.py:29-43` 읽음. **S4의 전제.**
- SSE 선례 → `grep -rn "EventSourceResponse"` 결과 `assist_router.py:329,358,387`·`manuscript_router.py:225`.
- `provider_factory.py`가 `ChatLiteLLM`만 만든다 → 파일 전문 읽음(`make_chat_litellm` 하나). **S4가 로깅을 직접 붙여야 하는 근거.**

**아직 확인하지 않은 것 (실행 중 확인할 것)**:

- 게이트웨이 가용성. 그릴링 중 **한 번은 TCP 연결 불가**였다(`nc -z` closed). LAN 호스트이므로 S2 착수 전에 실호출 1회로 살아 있는지 먼저 확인하고, 죽어 있으면 halt해 사람에게 알린다 — 목 테스트는 게이트웨이 없이도 돌지만 그것으로 "된다"고 말할 수 없다.
- `httpx`로 게이트웨이를 부를 것인지 `litellm.aimage_generation`을 쓸 것인지. LiteLLM은 이미 설치돼 있고 `litellm/images` 패키지가 존재하지만(`find` 결과), **openai_compatible 커스텀 base URL로 이미지 호출이 통하는지는 미확인**이다. 실측해 통하면 쓰고, 안 되면 `httpx` 직호출로 간다.
- 비전 호출의 소요 시간과 타임아웃 값. 그릴링에서는 측정하지 않았다.
- anyio 취소 스코프에서 이미지 커밋이 살아남는지 — S6에서 실측한다.

**이 저장소가 반복한 함정 (회고에서 가져옴)**:

- **목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다.** `summary-draft` 회고가 "테스트 초록 + 실제 경로 깨짐"의 네 유형(anyio 취소 스코프 · 타입 유니온 목 우회 · 손조립 응답의 기본값 `None` · 목의 부작용 미재현)을 모두 이 저장소에서 겪었다고 기록했다. **S6이 이 함정의 정면이다** — "저장 함수가 불렸다"가 아니라 DB와 파일을 실제로 조회한다.
- **취소·중단 경로는 실행 전에 실측한다.** 이 작업은 조용히 실패할 수 있는 변경(SSE 연결 끊김 + 비동기 커밋)의 교과서적 사례다.
- **방어를 제거해 red가 되는지 확인할 것.** 대상 넷: 교차 테넌트 404(S5), 묘사 실패 시 이미지 잔존(S6), `stream: false` 누락 시 파싱 실패(S3), 이미지 생성 로깅 누락(S4).
