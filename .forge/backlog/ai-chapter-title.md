<!-- forge-slug: ai-chapter-title -->
<!-- task: 55 -->
<!-- tdd: on -->
# 현재 화 제목을 씬 본문 기반으로 AI가 지어 주는 기능

## Goal / Non-goals
- Goal: 집필 화면 제목 입력란 옆에 AI 제목 생성 버튼을 붙인다. 클릭하면 현재 씬의 라이브 본문을 근거로 화 제목 1개를 생성해 제목 입력란에 채운다. 실제 AI 호출은 assist 도메인에 6번째 태스크 `title`을 추가해 처리한다(풀스택).
- Non-goals:
  - 다중 후보 선택 UI(단일 자동 채움만) — 필요해지면 별도 과제.
  - 화 전체(모든 씬) 본문 기반 생성 — 이번엔 현재 씬 라이브 본문만.
  - 생성 후 자동 저장 — 채우기만 하고 기존 blur→commitTitle로 저장(비파괴적).
  - 요약·장면이미지·다시쓰기(여전히 목업) 손대지 않음.

## Source of truth
- Glossary terms: 씬(Scene), 챕터=화, 작품(Work), 품질 티어(Quality Tier) — .forge/CONTEXT.md
- Related ADRs:
  - .forge/adr/0012-ai-chapter-title-as-assist-task.md (이 기능의 엔드포인트 형태 결정)
  - .forge/adr/0006-code-first-openapi-contract-pipeline.md (백엔드 스키마 → openapi.json → web SDK 재생성 파이프라인)
  - .forge/adr/0004-user-llm-setting-as-quality-tier.md (품질 티어 라우팅)
- Definition of Done: 로그인한 작가가 집필 화면에서 제목 입력란 옆 AI 버튼을 누르면, 현재 씬 본문 기반 제목이 생성돼 입력란에 채워지고, 빈 본문일 땐 토스트로 막힌다. api·web 양쪽 테스트와 pnpm typecheck·lint·test / ruff·mypy 통과.

## Work slices (TDD: 각 슬라이스는 실패하는 테스트를 먼저 작성)
- [ ] S1. 백엔드 assist에 `title` 태스크 배선 — `TaskType.title`(tier_routing) + `_title_llm_client`(다른 태스크처럼 fast writing client) + `TitleRequest{ text }`(blank 거부 validator, `cursorText` 패턴 재사용) + prompt_assembler에 title 프롬프트("본문 근거로 짧은 화 제목 하나만, 따옴표·접두어·개행 없이"). — 완료 기준: 서비스 단위 테스트에서 title 태스크로 조립된 메시지에 위 지시가 포함되고, blank text는 검증 오류가 난다.
- [ ] S2. 백엔드 라우터 `POST /api/v1/works/{work_id}/scenes/{scene_id}/assist/title` — 기존 assist 핸들러 미러(인증·교차테넌트 404·모더레이션 프리체크·rate limit·LLM 로깅·SSE `EventSourceResponse`/`[DONE]`). — 완료 기준: 라우터 테스트에서 인증 요청이 200 `text/event-stream`로 스트리밍되고, blank text는 422, 타 테넌트 접근은 404. (depends: S1)
- [ ] S3. 계약 재생성 — 백엔드 openapi.json 재수출 후 web `pnpm generate`로 SDK 재생성. — 완료 기준: docs/openapi.json에 `/assist/title` 경로와 `TitleRequest` 스키마가 존재하고, web `pnpm typecheck` 통과(생성 타입 반영). (depends: S2)
- [ ] S4. web assist.api.ts에 `title` 태스크 추가 — `AssistTaskType`에 `'title'`, `AssistPayloadMap.title = TitleRequest`. — 완료 기준: 단위 테스트에서 `streamAssist`가 taskType `title`일 때 `.../scenes/{sceneId}/assist/title`로 POST 한다. (depends: S3)
- [ ] S5. web UI — ManuscriptEditor 제목 입력란 옆 Sparkles 아이콘 버튼 + 생성 로직: 빈/짧은 본문이면 토스트 후 미호출, `useAssistStream('title', …)` 소비, 완료 시 후처리(첫 줄만·양끝 따옴표 제거·trim)해서 `titleDraft`에 채움, 생성 중 버튼 disabled+스피너. 본문은 `editor.getText({ blockSeparator:'\n' })`(라이브 draft). — 완료 기준: 컴포넌트 테스트에서 (a) 빈 본문 클릭 시 토스트+스트림 미호출, (b) 본문 있는 상태에서 스트림 완료 후 `aria-label="챕터 제목"` 입력란 value가 정제된 제목으로 바뀜, (c) 생성 중 버튼 disabled. (depends: S4)
