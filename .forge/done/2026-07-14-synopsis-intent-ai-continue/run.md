<!-- forge-slug: synopsis-intent-ai-continue -->
# run — 기획의도 AI 이어쓰기 (2026-07-14)

직접 실행(단일 세션, eco 모드 — Workflow 생략, 2슬라이스 소규모 작업이라 직접 처리). TDD on.

## 계획대로 된 것

- **S1** — `POST /works/{work_id}/synopsis/continue`(SSE) 신규: `manuscript_router.py`에 추가, `get_fast_writing_client()`(thinking 꺼짐) + `require_budget_available`/rate limiter/`is_explicit_content`+`stream_with_retry` 재사용. 프롬프트는 메모리 검색 없이 장르·서브장르·키워드·문체 + 클라이언트가 보낸 현재 텍스트만 조립(`_build_synopsis_continue_messages`). `SynopsisContinueRequest`(빈/공백 거부 validator) 스키마 신규. TDD 테스트 5건(프롬프트 조립·교차 테넌트 404·빈 텍스트 422·예산 차단·수위 검열 선제 차단).
- **S2** — `task contract`로 SDK 재생성 → `features/works/api/synopsis-continue.api.ts`(`useAssistStream`/`useChatStream`과 동일 패턴의 SSE 훅) 신규 → `synopsis-editor.tsx`에 "AI 이어쓰기" 버튼 추가, 기존 `SuggestionPicker`(`features/editor/components/suggestion-picker.tsx`) 그대로 재사용. 빈 기획의도 시 미호출+안내 토스트, "적용" 시 끝에 이어붙임(자동 저장 안 함), "취소" 시 패널만 닫힘. TDD 테스트 4건.
- **S3** — `task lint`(변경 파일 한정)·api pytest(907 passed, 1 skipped) + web `pnpm typecheck`·`lint`·`test`(42 files/199 tests) 전체 통과.

## 차이(divergences)

1. **UI 배치 — 저장/취소 버튼 행을 AI 제안 패널과 동시에 안 보이게 함**(계획에 없던 세부사항). `SuggestionPicker`도 "취소" 버튼을 자체적으로 갖고 있어서, 기획의도 레벨의 "취소"(마지막 저장으로 되돌리기) 버튼과 동시에 보이면 라벨이 겹쳐 혼동된다 — AI 제안 패널이 열려 있는 동안은 저장/취소/AI-이어쓰기 행을 패널로 완전히 교체(둘 다 안 보임)하는 쪽으로 결정.
2. **"적용" 시 공백 처리 버그를 테스트로 실제로 잡음** — `SuggestionPicker`가 재사용하는 `parseSuggestions()`는 후보 앞뒤 공백을 trim한다. 그래서 AI 응답이 " 회귀한 무사의..."처럼 앞에 공백을 포함해 와도 trim되어 사라지고, 그냥 이어붙이면 "이 작품은회귀한"처럼 단어가 들러붙는다. `intentDraft`가 공백으로 끝나지 않을 때만 구분자 공백을 추가하도록 수정 — 계획엔 없던 실제 버그 발견·수정.
3. **엔드포인트 위치 — `manuscript` 도메인에 그대로 둠**(계획대로) — `synopses` 리소스를 이미 소유한 도메인이라 자연스러운 확장. `works.title`은 이미 `PATCH /works/{work_id}`로 커버돼 있어 이번 작업과 무관.

## 후속 후보

- 없음 — S1~S3 전부 계획대로 완료, 비목표 위반 없음.
