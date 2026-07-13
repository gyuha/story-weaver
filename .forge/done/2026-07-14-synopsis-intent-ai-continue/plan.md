<!-- forge-slug: synopsis-intent-ai-continue -->
<!-- task: 53 -->
<!-- tdd: on -->
# 기획의도 AI 이어쓰기

## Goal / Non-goals

- Goal: 시놉시스 화면의 기획의도 필드에 "AI 이어쓰기"를 추가한다 — 작품의 장르·서브장르·키워드·문체 + 지금까지 쓴 기획의도 텍스트만 참고해(메모리 검색 없음) AI가 이어지는 텍스트를 생성하고, 사용자가 확인 후 기획의도 끝에 이어붙일 수 있다.
- Non-goals:
  - 메모리 검색(World Bible 엔티티 참고) — 이번엔 최소 컨텍스트(장르/서브장르/키워드/문체 + 기존 기획의도 텍스트)만.
  - 빈 기획의도에서 처음부터 새로 쓰기 — 기존 텍스트가 없으면 이어쓰기 등 5작업과 동일하게 안내 토스트만 보여주고 호출하지 않는다.
  - "적용" 시 자동 저장 — 적용은 입력란만 채우고, 저장은 기존 "저장" 버튼으로 사용자가 확정한다.

## Source of truth

- Glossary terms: 시놉시스 (Synopsis) — `.forge/CONTEXT.md`(변경 없음, 새 개념 아님)
- Related ADRs: none(기존 관례의 확장 — 새 트레이드오프 아님)
- Definition of Done: 기획의도 아래 "AI 이어쓰기" 버튼 클릭 시 실 LLM이 스트리밍 응답하고, `SuggestionPicker`에 후보가 표시되며, "적용" 클릭 시 기획의도 입력란 끝에 이어붙는다(자동 저장 안 됨). 기획의도가 비어 있으면 호출하지 않고 안내 토스트만 보여준다. `pnpm typecheck`·`pnpm lint`·`pnpm test` + `task lint`·`task test`(api) 전체 통과.

## Work slices

- [ ] S1. **백엔드 엔드포인트**: `api/src/domains/manuscript/router/manuscript_router.py`에 `POST /works/{work_id}/synopsis/continue` 추가 — 소유권 확인(미소유 404, ADR-0005)은 기존 `get_synopsis`/`upsert_synopsis`와 동일 패턴. 요청 바디는 `_CamelModel` 스타일(`assist_router.py`의 `ContinueRequest` 참고, 빈/공백 텍스트 거부 validator 포함). 프롬프트는 work의 `genre`/`sub_genre`/`keywords`/`style` + 현재 기획의도 텍스트만으로 조립(새 최소 프롬프트 어셈블러 함수 — `assist`의 `prompt_assembler.py` 패턴 참고하되 메모리 항목 없이). LLM 클라이언트는 `get_fast_writing_client()`(thinking 모드 꺼짐, `assist/tier_routing.py`) 재사용. `require_budget_available`/`record_usage`/rate limiter/`is_explicit_content`+`stream_with_retry`(수위 검열)까지 다른 LLM 엔드포인트와 동일하게 적용. SSE 스트리밍은 `assist_router.py`의 `_stream_response` 패턴 미러링. — 완료 기준(TDD): 실패 테스트 선작성 후 구현 — 프롬프트에 장르/서브장르/키워드/문체+기존 텍스트 포함 확인 / 미소유 작품 404 / 빈 텍스트 422 / 예산 초과 차단 / 수위 검열 선제 차단.

- [ ] S2. **프런트 연동** (depends: S1): `pnpm generate`로 SDK 재생성. `features/works/api/` 또는 `manuscript.api.ts`에 이 엔드포인트용 SSE 스트리밍 훅 추가(`features/editor/api/assist.api.ts`의 `useAssistStream` 패턴 그대로 미러링, 새 이름으로 자기완결적으로 복제 — editor 도메인 파일은 손대지 않음). `synopsis-editor.tsx`에 "AI 이어쓰기" 버튼 추가(기획의도 textarea 아래, 저장/취소 버튼과 나란히 또는 그 위) — 클릭 시 현재 `intentDraft`가 비어 있으면(trim 후 빈 문자열) 호출하지 않고 안내 토스트, 아니면 스트림 시작. 스트리밍 중·완료 후 결과는 `SuggestionPicker`(`features/editor/components/suggestion-picker.tsx`, 그대로 재사용)로 표시 — "적용" 클릭 시 받은 텍스트를 `intentDraft` **끝에** 이어붙이고(자동 저장 안 함) 패널 닫기, "취소" 클릭 시 패널만 닫기. — 완료 기준(TDD): 실패 테스트 선작성 후 구현 — 빈 기획의도에서 버튼 클릭 시 미호출+안내 토스트 / 텍스트 있을 때 클릭 시 스트림 시작+점진 렌더 / "적용" 클릭 시 기획의도 끝에 이어붙음(저장 API는 호출 안 됨) / "취소" 클릭 시 기획의도 불변.

- [ ] S3. **검증** (depends: S2): `cd api && task lint && task test`, `cd web && pnpm typecheck && pnpm lint && pnpm test` 전체 통과 + UAT(실 브라우저에서 기획의도 작성 → AI 이어쓰기 → 적용 → 저장까지 왕복 확인). — 완료 기준: DoD 충족.
