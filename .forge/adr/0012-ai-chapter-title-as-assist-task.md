# AI 화 제목 생성 — 씬 스코프 assist SSE의 6번째 태스크로 구현

집필 화면의 화 제목을 "현재 씬 본문 기반으로 AI가 지어 주는" 기능을 붙이면서, 엔드포인트 형태를 결정했다.

**결정: 전용 엔드포인트를 새로 만들지 않고, 기존 assist 도메인에 `title`을 6번째 태스크로 추가한다.** 경로는 다른 assist 태스크와 동일하게 `POST /api/v1/works/{work_id}/scenes/{scene_id}/assist/title`, 응답은 SSE(`EventSourceResponse`, `[DONE]` sentinel)로 continue·infill·dialogue·style·correct와 완전히 동일한 와이어 포맷을 따른다. 본문은 요청 바디(`TitleRequest.text`)로 직접 받는다(DB 미저장 draft를 반영하기 위한 assist의 관례 그대로).

이렇게 하면 모더레이션 프리체크, 품질 티어 라우팅(`get_fast_writing_client` — thinking off의 fast 클라이언트), rate limit, LLM 호출 로깅(`bind_llm_call_context`), SSE 스트리밍 헬퍼를 새로 배선하지 않고 전부 재사용한다. web도 기존 `useAssistStream` 훅에 `title` 태스크 타입만 추가해 그대로 소비한다.

**의미론적 부조화는 감수한다.** "제목"은 화(chapter) 개념이고 실제 저장도 화 스코프(`renameChapter` → chapters PATCH)인데, 생성 엔드포인트는 씬(scene) 스코프에 놓인다. 이유: 이번 기능의 본문 범위를 "현재 씬 라이브 본문"으로 좁혔고([[ai-chapter-title]] 계획의 결정), assist가 이미 씬 스코프 + 본문-바디 전달 구조라 그 결에 정확히 맞는다. 짧은 제목을 SSE로 스트리밍해 받는 것도 과하지만, `useAssistStream`이 청크를 누적해 완료 시 한 번에 채우므로 소비 측 비용은 사실상 0이다.

## Considered Options

- **전용 chapter 스코프 JSON 엔드포인트** (`POST .../chapters/{chapter_id}/title` → `{title}` 반환) — 의미론은 가장 깔끔하나 라우터·스키마·티어 클라이언트·모더레이션·로깅·SDK 재생성을 새로 배선해야 한다. eco 원칙과 "assist 인프라가 이미 다 있다"는 사실에 비춰 거부.
- **assist 6번째 태스크 `title` (채택)** — 인프라 100% 재사용. 대가는 위의 의미론적 부조화 하나뿐. 나중에 화 전체 본문 기반·다중 후보 등으로 확장할 때 화 스코프 재설계가 필요해지면 그때 이 결정을 뒤집는다(공개 OpenAPI 계약 변경 + web 재배선 비용 발생 — 되돌리기 비용이 있어 이 ADR을 남긴다).
- **비스트리밍으로 assist에 얹기** — assist 전체가 SSE라 title만 JSON으로 두면 도메인 내 일관성이 깨진다. 일관성을 위해 SSE 유지.
