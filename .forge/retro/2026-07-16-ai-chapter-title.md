# 2026-07-16 — AI 화 제목 생성(assist 6번째 태스크 `title`) 풀스택 구현

## Plan vs actual
- What went as planned:
  - 슬라이스 구조(S1 백엔드 배선 → S2 라우터 → S3 계약 재생성 → S4 web API → S5 UI)와 DoD를 그대로 달성. 직렬 의존이라 직접 실행(워크플로우 아님)으로 처리 — 병렬 이득 0인 판단이 맞았다.
  - `assist_continue` 미러 전략이 정확히 들어맞음(인증·404·프리체크·rate limit·SSE `[DONE]`·LLM 로깅 전부 재사용). S3은 루트 `task contract` 한 번으로 openapi.json + web SDK 재생성 완결.
- Divergences:
  - **훅 시그니처 오추정** — 계획이 `useAssistStream('title', …)`로 적었으나 실제는 인자 없는 `useAssistStream()` + `assist.start('title', {payload})`이고 **완료 콜백이 없음**. 실제 API를 따르고 완료는 `isStreaming` true→false 전이(`prevStreamingRef`)로 감지.
  - **`title` ↔ `str.title()` 충돌** — `StrEnum`은 `str` 상속이라 멤버명 `title`이 메서드를 가려 mypy strict가 거부. `continue_` 관례대로 `title_ = "title"`로 명명(값·경로·web 유니온은 리터럴이라 와이어 무영향).
  - **단일 assist 인스턴스 공유** — 이어쓰기/제목을 별도 훅 인스턴스로 격리하려 했으나, 테스트 목의 `setMockAssistState`가 모듈 전역 단일 세터라 마지막 렌더 인스턴스로 덮여 이어쓰기 테스트가 깨짐 → 단일 인스턴스 공유 + `generatingTitle` 상태 + 전이감지 + 상호 리셋(`runContinue`↔`generateTitle`)으로 교차오염 차단.
  - **메모리 검색 생략(ADR 미명시 판단)** — title은 본문만 근거로 하므로 `assist_service`의 전체 메모리 검색 생략 조건에 `correct`와 함께 포함(최소 주입=고유명사만).
  - **"짧은 본문" 가드** — 계획 문구는 "빈/짧은"이나 DoD는 "빈 본문"만 요구 → 임의 임계값 없이 공백 trim 후 빈 값만 차단(이어쓰기 버튼과 동일 패턴).

## Learnings
- Do differently next time:
  - **fg-ask 그릴링 때 "소비할 훅/함수의 실제 시그니처"를 코드에서 확인해 슬라이스에 박을 것.** 이번엔 계획의 `useAssistStream('title')`가 실제 API와 달라 S5 구현에서 재해석이 필요했다. editor 도메인 assist 소비 훅은 인자 없는 `useAssistStream()` + `start(taskType, {workId,sceneId,payload})`, 완료 콜백 없음(완료=`isStreaming` 하강 전이).
  - **`StrEnum`(=`str`) 멤버명은 str 메서드 충돌을 미리 점검.** `title`/`split`/`strip`/`format` 등과 겹치면 mypy strict가 막는다. `continue_`처럼 밑줄 접미사로 회피(값은 원문 유지).
  - **editor assist 테스트 목 구조 주의** — `manuscript.test.tsx`의 `useAssistStream` 목은 `setMockAssistState`를 모듈 전역에 두고 마지막 렌더가 덮어쓴다. 컴포넌트가 assist 훅을 2개 이상 쓰면 기존 이어쓰기 테스트가 깨지므로, 다중 스트림이 필요하면 목부터 재설계해야 한다.
- Follow-up 후보:
  - **기존 ruff 부채** — `tests/auth/test_auth_flows.py`에 RUF059(6)·RUF043(1) 총 7건이 사전 존재(이 태스크와 무관). 전체 `task lint`를 레드로 만든다. 별도 fg-quick으로 정리 권장(이번 범위 밖이라 미수정).
  - **화 스코프 재설계** — ADR-0012 기록대로, 화 전체 본문 기반·다중 후보로 확장 시 씬 스코프 endpoint를 화 스코프로 되돌리는 결정을 다시 검토.

## Doc updates
- CONTEXT.md promotion: none ("화 제목"은 기존 챕터 개념, 신규 용어 아님)
- ADR added: none (메모리 검색 생략 결정은 사용자 판단으로 회고 로그에만 기록 — ADR 3조건 미충족, ADR-0012가 이미 기능을 다룸)
