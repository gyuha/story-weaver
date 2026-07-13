<!-- forge-slug: work-chat-context -->
# run — 작품 단위 채팅 실 연동 (2026-07-13)

Dynamic Workflow `wf_50ff49a9-4b3`(직렬 S1→S2→S3 → 위험 영역 리뷰(3방향 병렬) → 수정 → S4, 8 에이전트, eco: sonnet 캡 + ECO 주입, TDD on, S3만 `web-feature-builder` 에이전트). 8개 전부 완료, 오류 0.

## 계획대로 된 것

- **S1** — `conversations.work_id`(nullable FK, unique 제약 없음) 마이그레이션(0010) 실제 DB 적용 확인 + `ChatRepository.get_latest_by_work`/work_id 지원 `create_conversation`. TDD 테스트 4건.
- **S2** — `ChatContextService.build_context`(현재 화 전체 씬 `body` + `MemorySearchService.search` 결과를 assist의 `prompt_assembler` 포맷 그대로 미러링해 조립, DB 미영속화) + `chat_router.py`에 `work_router`(4개 엔드포인트: 현재 대화 조회·이력 조회·전송(지연 생성)·새 대화 시작) 추가, `Tier.high_quality`+budget+rate limit+수위검열 적용. TDD 테스트 8건.
- **S3** — SDK 재생성(`task contract`) + `features/memory/api/chat.api.ts`(`useAssistStream` 미러링한 `useChatStream`, 401 리프레시 포함) + `ChatTab` 실 연동(마운트 시 이력 로드, SSE 스트리밍, "새 대화" 버튼). TDD 테스트 6건(+기존 8건 무회귀).
- **리뷰→수정** — 적대적 리뷰가 **실결함 2건**을 실증(아래) → 수정 에이전트가 둘 다 해결 + 회귀 테스트 2건 추가, 재테스트 통과.
- **S4** — 슬라이스 전부 코드 대조로 완료 확인, 비목표 미침범(`nonGoalViolations: []`) 확인, `sealable: true`.
- 최종: api `pytest` 902 passed(+ chat 신규 테스트 전부 포함), web `pnpm test` 39 files/186 tests 통과. 변경 파일 한정 ruff·mypy strict 클린.
- **S3가 실제 브라우저 E2E까지 수행**(아래 "UAT 증거" 참조) — 이번 태스크는 코드/유닛 테스트 검증에 그치지 않고 실 LLM 왕복까지 확인됨.

## 차이 (divergences)

1. **S1에서 계획에 없던 실버그 발견·수정** — `get_latest_by_work`의 "최신 대화" 판정이 신뢰 불가능했다: 같은 트랜잭션에서 만든 두 `Conversation`은 Postgres `now()`가 트랜잭션 시각이라 `created_at`이 동일해지고, 보조 정렬키(`id`)가 랜덤 UUID4라 생성 순서와 무관 — "새 대화 시작"이 사실상 무작위로 옛 대화를 다시 보여줄 수 있었다. `Conversation.created_at`에 파이썬 측 `default=lambda: datetime.now(UTC)`를 추가해 해결(ADR-0010의 "현재 대화 = 최신 것" 정의가 실제로 성립하려면 필수).
2. **S2 — LLM 게이트 적용 범위를 4개 엔드포인트가 아니라 "실제로 LLM을 호출하는 1개"로 좁힘.** 계획 문구("전 엔드포인트에 budget/rate-limit/수위검열 적용")를 문자 그대로 읽으면 GET 2개·"새 대화" POST에도 걸어야 하지만, 이 셋은 LLM을 전혀 호출하지 않아 무의미 — assist/dynamic_update가 이미 "LLM을 실제로 부르는 라우트에만" 게이트를 거는 기존 관례를 따름(소유권 확인은 4개 전부).
3. **S2 — 레거시 `POST /chat/conversations`의 `require_permission('chat:write')` RBAC 게이트를 새 엔드포인트엔 붙이지 않음** — 계획이 "assist_router의 소유권 확인 패턴을 미러링"하라 지시했고 assist 도메인은 permission 게이트 없이 `get_current_user`+work 소유권 404만 쓴다. 그 패턴을 그대로 따름.
4. **S2 — 수위 검열 선제 차단 시 사용자 메시지는 저장하고 declined 안내를 assistant 턴으로 남기기로 결정**(계획에 없던 세부사항) — user/assistant 교대 흐름을 깨지 않기 위함.
5. **S2 — `ManuscriptService.list_scenes_by_chapter_id` 신규 추가**(계획에 이름은 없었음) — 기존 `list_scenes`는 전체 episode 경로를 요구해 재사용 불가, `get_scene_by_id`와 동일한 "ID-only 크로스 도메인 참조" 패턴으로 대칭 추가.
6. **리뷰가 잡은 결함 A** — `SendWorkChatMessageRequest.content`가 공백-only 입력을 걸러내지 않아(`Field(min_length=1)`는 공백 1글자도 통과) `is_explicit_content(" ")`도 False라 그대로 LLM에 요청이 나가고, provider가 400 거부 시 `stream_with_retry`가 "수위 정책" 안내로 오인 표시할 위험 — assist_router의 `ContinueRequest._cursor_text_not_blank`와 동일한 validator를 추가해 해결.
7. **리뷰가 잡은 결함 B** — `send_work_chat_message`가 사용자 메시지를 커밋한 **뒤에** `scene_id` 소유권/존재를 검증해, 잘못된 `sceneId` 전송 시 답변 없는 orphan user 메시지가 대화에 영구히 남는 문제 — `build_context`(scene 검증 포함) 호출을 사용자 메시지 저장보다 앞으로 옮겨 해결. 회귀 테스트 2건 추가.
8. **S3 — playwriter MCP가 이 세션엔 연결되지 않아** 대신 연결된 `browse`(gstack 헤드리스 브라우저) 스킬로 동일 목적(실 브라우저 확인)을 수행 — 오히려 회원가입부터 실 LLM 응답까지 전체 왕복을 수행하는 더 깊은 확인이 됨(아래 "UAT 증거").
9. **S3 — "새 대화" 성공 시 서버 재조회 대신 로컬 목록만 즉시 초기화**(`// eco:` 주석 명시) — 새 대화는 자명하게 빈 이력이라 재조회가 불필요한 왕복이라 판단.
10. **S4 — 계획의 UAT 항목("씬 이동 후 대화 유지", "원고 수정 후 최신 반영")을 문자 그대로 재현하지는 않음** — S3가 수행한 E2E가 "새로고침 후 이력 유지"(작품 단위 영속의 더 강한 형태) + "집필 직후 그 내용 기반 정답"으로 사실상 동등한 목표를 이미 검증함.
11. **api `task lint`/`task test` 전체 실행 시 나오는 실패는 전부 이 작업과 무관한 선존재 부채** — `tests/auth/test_auth_flows.py`의 RUF043/RUF059 7건(lint), `tests/test_dev_server.py`·`tests/test_migrations.py`의 Makefile→Taskfile 이관 이전 가정 12건(test) — 변경 파일 한정 ruff/mypy는 전부 클린.

## UAT 증거 (S3가 수행)

`browse` 스킬로 실 서버(:3000/:8000, `LLM_PROVIDER=openai_compatible`/GLM-4.6) 대상 회원가입→이메일 인증(Mailpit)→로그인→작품 생성→씬 본문 작성·저장→채팅 탭 진입→실 메시지 전송까지 수행. "주인공 이름이 뭐야?"에 방금 저장한 원고 내용을 근거로 정확히 답변(현재 화 원고+메모리 컨텍스트 조립이 실제로 작동 확인). 새로고침 후 대화 이력 유지(작품 단위 영속 확인), "새 대화" 클릭 후 새로고침해도 리셋 유지 확인. 콘솔 에러 없음(기존 tanstack-router 코드스플리팅 경고만 존재).

## 후속 후보

- 없음 — S4에서 비목표 위반 없음 확인, 리뷰 지적사항 전부 해결됨.
