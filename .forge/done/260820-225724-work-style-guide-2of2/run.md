# RUN — 집필 보조 태스크별 온도 테이블을 둔다

slug: work-style-guide-2of2 · task 85 · part 2/2 · tdd: on
실행: 2026-08-20 · Dynamic Workflow(에이전트 2개 — `api-backend-builder`, eco→sonnet) · 소요 약 20분 · 서브에이전트 토큰 196k

## 슬라이스별 결과

- S1 `TASK_TEMPERATURE` 테이블 + 전달 배선 — ⚠ 계획대로 착지, **시그니처에 `task=None` 기본값을 둬 범위 밖 호출부를 보호했다**(아래 발산 1)
- S2 검증 — ✅ 계획대로, 방어 제거 red 2종을 모두 확인했다

## 계획대로 된 것

- **온도가 티어와 다른 축으로 분리됐다.** `TASK_TEMPERATURE`를 `TASK_TIER`에 얹지 않고 독립 dict로 뒀다 — `correct`와 `continue_`가 같은 `low_cost`인데 필요한 온도는 반대라는 계획의 근거를 그대로 따랐다.
- **8종 전부 등재되고 키 집합이 일치한다**(직접 확인): `continue·infill·dialogue·style·draft = 0.7`, `correct·title·summary = 0.2`, `set(TASK_TEMPERATURE) == set(TASK_TIER) == set(TaskType)` → True.
- **계획이 요구한 "테이블에 있다"와 "전달된다"의 구분이 지켜졌다.** 테스트가 3중이다: ① 표 완전성 ② 라우터 의존성 함수가 자기 `TaskType`을 넘기는지(8종 파라미터화) ③ 그 값이 `ChatLiteLLM` 생성 kwargs까지 실려 가는지.
- **비목표를 지켰다** — `.env`의 전역 `LLM_TEMPERATURE=1.0` 불변, 작가 노출 없음(ADR-0004), `manuscript_router`(기획의도 이어쓰기)는 **한 줄도 건드리지 않았다**.
- **근거의 한계를 코드 주석에 남겼다** — "이 값은 조언과 통념에 기댄 것이고 이 저장소에서 측정한 값이 아니다"(계획 검증 노트 1번의 정직성 요구).
- **게이트를 직접 재실행해 확인**: `1303 passed · 12 failed(Makefile 기존) · errors 0`, `ruff` 클린, `mypy src` 171파일 no issues. 백엔드 테스트 1285 → **1303**(+18).

## 발산

1. **`get_fast_writing_client(task: TaskType | None = None)`로 기본값을 둔 것이 유일한 설계 발산이다.** 계획은 "요청별로 전달하라"만 말했는데, `manuscript_router.py:160`이 이미 이 함수를 인자 없이 호출하고 있었다. 강제 인자로 바꾸면 그 경로까지 수정해야 하는데 그것은 **계획이 명시한 비목표**(기획의도 이어쓰기는 이번 범위 밖, 전역 1.0 유지)였다. `None`이면 override 없이 기존 동작을 유지하도록 분기해 비목표를 지켰다. 실제로 강제 인자로 갔다가 `mypy`가 `Missing positional argument "task"`로 잡아 이 설계로 돌아왔다 — **타입 검사가 범위 침범을 막은 사례다.**
2. **워킹트리를 part 1/2와 공유한 상태로 작업했다.** #84의 변경(문체 지침 관련 백엔드·프론트 다수)이 커밋되지 않은 채 남아 있었고, S1이 `git diff -- <자기 4개 파일>`로 스코프를 재확인해 자기 변경만 보고했다. 두 작업이 같은 파일을 건드리지 않았기에 충돌은 없었지만, **part를 연달아 실행할 때 워킹트리가 섞이는 것은 구조적 위험**이다(아래 후속 후보).

## 방어를 깨뜨려 red를 확인한 것

S2가 둘을 수행했고, 둘 다 **"상수가 있다"가 아니라 "배선이 산다"를 본다**는 것을 증명했다.

1. **전달 배선 단절** — `get_fast_writing_client`의 `LLMClient(temperature=TASK_TEMPERATURE[task])`를 `LLMClient()`로 끊으니:
   ```
   assert creative_kwargs["temperature"] == 0.7
   E   assert 1.0 == 0.7
   ```
   `ChatLiteLLM` 생성 호출까지 mock으로 도달해 실제 kwarg가 전역 기본값 `1.0`으로 떨어진 것을 관측했다. **이 테스트는 표가 아니라 배선을 본다.**
2. **표 완전성** — `TASK_TEMPERATURE`에서 `summary`를 빼니 2건 red(`Extra items in the right set: TaskType.summary`, `KeyError`). 태스크가 늘 때 누락되면 잡힌다는 증거다.
3. S1도 자체적으로 라우터 배선을 확인했다 — `_correct_llm_client`를 `TaskType.continue_`로 바꿔 `expected call not found`를 관측하고 원복했다.
4. 두 경우 모두 원복 후 `git diff --stat`으로 잔여물이 없음을 확인했다.

## UAT

이 계획의 완료 정의는 **처음부터 pytest 레벨만 요구했다**("8종이 각자의 온도로 호출되고 그 값이 테스트로 고정된다. `task test`·`task lint` 통과"). 사용자 대면 표면 변화가 없으므로 브라우저 확인 대상이 없다.
- 직접 실행: `1303 passed · errors 0` · ruff·mypy 클린 · 테이블 8종·키 집합 일치 실측.
- **온도가 실제 생성 결과를 어떻게 바꾸는지는 측정하지 않았다** — 계획이 명시한 비목표이며, 그러려면 같은 프롬프트를 여러 온도로 반복 생성해 비교해야 한다.

## 후속 작업 후보

- **테이블이 닿지 않는 세 경로가 남았다(계획이 의도한 미해결)** — 채팅(`chat_context_service`), 비트 시트(`works_router`), 기획의도 이어쓰기(`manuscript_router`)는 여전히 전역 `1.0`이다. 문체 일관성 관점에서 채팅은 상관없지만 비트 시트·기획의도는 창작 산출물이라 재검토 거리다.
- **0.7/0.2의 근거를 실측으로 대체하기** — 지금은 조언에 기댄 값이다. 같은 프롬프트·같은 모델로 온도만 바꿔 여러 번 생성해 문체 흔들림을 비교하면 근거가 생긴다.
- **part를 연달아 실행할 때 워킹트리가 섞인다**(발산 2). part 1을 커밋한 뒤 part 2를 시작하면 각 part의 diff가 깨끗하게 분리된다 — Run all 절차에 커밋 지점이 없는 것이 원인이다.
