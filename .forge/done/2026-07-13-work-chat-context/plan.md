<!-- forge-slug: work-chat-context -->
<!-- task: 51 -->
<!-- tdd: on -->
# 작품 단위 채팅 실 연동 — 현재 화 원고 + 메모리 기반 컨텍스트

## Goal / Non-goals

- Goal: 집필 화면 "채팅" 탭을 mock(고정 응답)에서 실제 LLM 연동으로 전환한다. 대화는 씬이 아니라 **작품 단위**로 이어지고(씬을 옮겨도 유지), 매 메시지마다 **현재 화(챕터) 원고 전문 + 메모리 검색 결과**로 컨텍스트를 새로 조립해 최신 집필 내용을 반영한다. "새 대화 시작"을 지원한다.
- Non-goals:
  - 작품 전체 원고를 통째로 컨텍스트에 포함 — 현재 화로 범위를 제한한다(ADR-0010). "작품 전체 요약"이 필요한 질의는 이번에 커버하지 않는다.
  - 과거 대화 목록 조회·재열람 UI — "새 대화 시작"만 지원하고, 지난 대화를 다시 불러보는 기능은 별도 과제.
  - 대화 영구 삭제/이력 정리 — 지난 대화는 DB에 남겨두기만 한다.
  - 기존 "요약" 액션 칩(`manuscript.tsx`의 mock) 구현 — 이번 범위 밖.

## Source of truth

- Glossary terms: 채팅 (Chat), 메모리 (Memory), 품질 티어 (Quality Tier) — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/0010-work-scoped-chat-context.md`(이번 그릴링에서 확정), `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`(수위 검열 재사용), `.forge/adr/0004-user-llm-setting-as-quality-tier.md`(티어 개념), `.forge/adr/0005-users-as-tenant-app-layer-scoping.md`(소유권 404 패턴)
- Definition of Done: 채팅 탭에서 메시지를 보내면 실 LLM이 현재 화 원고+메모리 기반 컨텍스트로 스트리밍 응답하고, 대화가 DB에 영속되어 씬을 옮겨도 이어진다. "새 대화" 버튼으로 리셋할 수 있다. `task lint`·`task test`(api)와 `pnpm typecheck`·`pnpm lint`·`pnpm test`(web) 전체 통과.

## Work slices

- [ ] S1. **DB 스키마 + 리포지토리**: `chat.conversations`에 `work_id`(nullable FK `works.id`, `ondelete=CASCADE`, index) 추가하는 Alembic 마이그레이션. `(user_id, work_id)` 유니크 제약은 **두지 않는다**(ADR-0010 — "새 대화 시작"이 같은 작품에 새 row를 만들 수 있어야 함). `ChatRepository`에 작품 스코프 쿼리 추가(예: `get_latest_by_work(work_id, user_id)`, `create_for_work(work_id, user_id, ...)`). — 완료 기준(TDD): 마이그레이션 적용 후, 리포지토리 테스트로 "같은 work_id로 대화를 여러 개 만들 수 있고, 조회 시 가장 최근 것이 반환됨"을 확인.

- [ ] S2. **컨텍스트 조립 + 엔드포인트** (depends: S1): 현재 화(챕터)의 모든 씬 원고 전문 + `MemorySearchService.search(work_id, user_id, scene_id)` 결과로 매 요청마다 프레시 시스템 메시지를 조립하는 서비스를 추가하고, `chat_router.py`에 다음을 추가한다.
  - `GET /works/{work_id}/chat/conversation` — 작품의 현재(최신) 대화 조회, 없으면 null
  - `GET /works/{work_id}/chat/conversation/messages` — 메시지 이력 조회
  - `POST /works/{work_id}/chat/messages` — body `{content, sceneId}`; 대화가 없으면 지연 생성 + 프레시 컨텍스트 조립 + SSE 스트리밍 + DB 영속화(assist_router의 SSE/영속 패턴과 동일)
  - `POST /works/{work_id}/chat/conversations` — "새 대화 시작"(명시적 신규 생성)

  전 엔드포인트에 소유권 확인(미소유 작품 404, ADR-0005) + `require_budget_available`/`record_usage`/rate limit + `is_explicit_content` 선제 차단·`stream_with_retry` 완화 재시도(ADR-0003) + `Tier.high_quality`(thinking 모드 켬 — 이어쓰기 등과 달리 분석적 질의응답이라 추론 품질 우선) 적용. — 완료 기준(TDD): 컨텍스트에 현재 화 원고+메모리 항목이 포함됨 / 미소유 작품 404 / 예산 초과 시 차단 / 수위 검열 선제 차단 / 대화가 work_id로 스코프됨 / "새 대화" 호출이 별도 row를 만듦 — 각각 테스트로 확인.

- [ ] S3. **프런트 실 연동** (depends: S2): `pnpm generate`로 SDK 재생성. `features/memory/api/chat.api.ts`에 대화·이력 조회 TanStack Query 훅 + `useAssistStream`과 동일한 패턴의 SSE 전송 훅을 추가하고, `memory-panel.tsx`의 `ChatTab`을 mock(`MOCK_REPLY`)에서 실 API로 전환한다 — 마운트 시 작품의 현재 대화·이력을 로드, 전송 시 SSE로 점진 렌더, 스트리밍 중 입력 비활성화, "새 대화" 버튼 추가. 기존 말풍선 UI·자동 스크롤 동작은 그대로 유지. — 완료 기준(TDD): 마운트 시 이력 로드 호출 / 전송 시 API 호출 + 스트리밍 텍스트 반영 / "새 대화" 클릭 시 신규 생성 호출 + 화면 초기화 / 에러 토스트 표시 — 각각 테스트로 확인 + 기존 `memory-panel.test.tsx` 회귀 없음.

- [ ] S4. **검증** (depends: S3): `task lint`·`task test`(api), `pnpm typecheck`·`pnpm lint`·`pnpm test`(web) 전체 통과 + UAT(실 채팅 왕복 확인, 씬 이동 후 대화 유지 확인, 원고 수정 후 다음 질문에 최신 내용이 반영되는지 확인, "새 대화" 리셋 확인). — 완료 기준: DoD 충족.
