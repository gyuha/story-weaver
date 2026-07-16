<!-- forge-slug: ai-chapter-title -->
<!-- task: 55 -->
# RUN — 현재 화 제목을 씬 본문 기반으로 AI가 지어 주는 기능

실행 방식: **직접 실행**(Dynamic Workflow 아님). 5개 슬라이스가 완전 직렬 의존(S1→S2→S3→S4→S5)이라 병렬 이득이 없고, 사전 도메인 매핑으로 정확한 삽입 지점을 확보한 상태여서 워크플로우 오케스트레이션 비용이 순손실이었다(사용자 승인). TDD: 각 슬라이스 실패 테스트 먼저 → 구현 → 통과.

## 계획대로 된 것
- **S1** 백엔드 assist에 `title` 태스크 배선: `TaskType.title_`(tier_routing) + `TASK_TIER`에 `Tier.low_cost` + `TitleInput` dataclass + `AssistTaskInput` union + `prompt_assembler` title 프롬프트("본문 근거·짧은 제목 하나·따옴표/접두어/개행 없이") + 분기 + `TitleRequest`(blank 거부 validator) + `_title_llm_client`. 단위 테스트(prompt_assembler·tier_routing) 그린.
- **S2** 라우터 `POST /api/v1/works/{work_id}/scenes/{scene_id}/assist/title` — `assist_continue`를 미러(인증·교차테넌트 404·모더레이션 프리체크·rate limit·LLM 로깅·SSE `[DONE]`). 라우터 테스트 3건(스트리밍+메모리 생략, blank 422, 타테넌트 404) 그린.
- **S3** 계약 재생성: 루트 `task contract`(= `api:openapi` → `web:generate`) 한 번으로 완료. `docs/openapi.json`에 `/assist/title`·`TitleRequest` 추가, web SDK(`src/api/*`) 재생성, web `pnpm typecheck` 통과.
- **S4** web `assist.api.ts`에 `title` 태스크: `AssistTaskType` 유니온·`AssistPayloadMap`·`@/api` import 추가. URL 빌더가 태스크명을 그대로 붙여 `.../assist/title`로 라우팅. 단위 테스트(URL·바디) 그린.
- **S5** ManuscriptEditor 제목 입력란 옆 Sparkles 버튼 + 생성 로직: 빈 본문 토스트 가드, 스트림 소비, 완료 시 후처리(첫 줄만·양끝 따옴표 제거)해 `titleDraft` 채움(저장은 기존 blur→commitTitle), 생성 중 disabled+스피너. 컴포넌트 테스트 4건 그린.

## 계획과 달랐던 것 (divergences)
1. **S5 훅 API 형태** — 계획은 `useAssistStream('title', …)`로 적었으나 실제 훅은 인자 없는 `useAssistStream()` + `assist.start('title', { workId, sceneId, payload:{text} })`이고 **완료 콜백이 없다**. 실제 API를 따랐고, 완료 감지는 `isStreaming` true→false 전이(`prevStreamingRef`)로 구현.
2. **단일 assist 인스턴스 공유(설계 결정)** — 두 번째 `useAssistStream()` 인스턴스로 격리하려 했으나, 기존 테스트 목이 `setMockAssistState`를 모듈 전역에 두고 마지막 렌더 인스턴스로 덮어써(이어쓰기 테스트 회귀 유발) 두 인스턴스가 불가. 이어쓰기와 제목이 상호배타적 작업이고 훅이 이전 스트림을 abort하므로 단일 인스턴스를 공유. 교차오염은 `generatingTitle` 상태 + 전이감지 + 상호 리셋(`runContinue`가 `generatingTitle` 리셋, `generateTitle`이 `showDraft` 닫음)으로 차단.
3. **`title` → `title_` (mypy)** — `StrEnum`은 `str` 상속이라 멤버명 `title`이 `str.title()` 메서드를 가려 mypy strict가 거부. `continue_` 관례대로 `title_ = "title"`로 명명(값은 `"title"`). 경로(`/title`)·web 유니온(`'title'`)은 리터럴이라 와이어 포맷 무영향.
4. **메모리 검색 생략(ADR 미명시 판단)** — title은 본문만 근거로 하므로 `assist_service`의 전체 메모리 검색 생략 조건에 `correct`와 함께 포함(최소 주입=고유명사만). ADR-0012에 명시되지 않아 여기서 결정.
5. **"짧은 본문" 가드** — 계획 S5 문구는 "빈/짧은"이나 DoD는 "빈 본문일 땐 토스트"만 요구. 임의 문자 임계값 없이 공백 trim 후 빈 값만 차단(이어쓰기 버튼과 동일 패턴, DoD 충실).

## 의도적으로 안 한 것
- **title 실-LLM 통합 테스트 미추가** — 계획/기존 관례상 실 z.ai 통합 테스트는 continue 1건뿐. title은 동일 클라이언트(`get_fast_writing_client`)·동일 스트리밍 헬퍼를 쓰므로 continue 실-LLM 테스트로 실 경로가 전이적으로 검증됨(UAT에서 해당 테스트 재실행 통과 확인).
- **title용 moderation 테스트 미추가** — 프리체크(`is_explicit_content(payload.text)`)가 correct/style과 동일. 기존 moderation 테스트가 메커니즘을 커버.

## 검증(자동)
- api: `mypy src` 클린(159파일), 변경 파일 `ruff` 클린, `pytest tests/assist/` 51 통과(실-LLM 1건 별도 통과).
- web: `biome check` 클린, `tsc --noEmit` 클린, `vitest` 215 통과(신규 5건 포함, 회귀 0).

## 알려진 이슈 (범위 밖)
- **기존 ruff 부채** — `tests/auth/test_auth_flows.py`에 RUF059(6)·RUF043(1) 총 7건이 사전 존재. 이 태스크와 무관해 손대지 않음 → 그 파일 때문에 전체 `task lint`는 레드. 내가 변경한 파일은 전부 ruff 클린.
