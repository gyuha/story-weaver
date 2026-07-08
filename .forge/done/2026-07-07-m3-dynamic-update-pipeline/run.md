# RUN — M3: 동적 업데이트 파이프라인(신규 설정 감지 → 승인 → 반영)

slug: m3-dynamic-update-pipeline · task: 38 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 3단계(eco: sonnet 상한 + ECO 규율 주입): Extract(S1) → Suggest(S2+S3 함께) → Wire(S4, 웹).

## 계획대로 된 것

- **S1**: `dynamic_update` 도메인, `POST .../extract-updates` — 저비용 티어 LLM으로 신규 엔티티/속성변경/타임라인변화 JSON 추출(방어적 파싱).
- **S2+S3**: name/alias 정확 매칭 + 동일값 노이즈 억제, `update_suggestions` 테이블(마이그레이션 `0008`), 승인 시 종류별 반영(신규 엔티티 생성/속성 갱신/`TimelineState(source=ai_suggested)` 생성), 거절은 상태만 변경.
- **S4**: 씬 저장 후 자동 추출 트리거, 메모리 패널의 기존 제안 카드 UI(살아있는 코드였음, 확인 후 실 데이터로 교체)에 반영/무시 배선.

## 계획 대비 차이 (divergences)

1. **제 워크플로우 설계 실수**: S4(웹)를 계약 재생성 단계 없이 S1-S3(백엔드) 직후 같은 스크립트에 넣어, S4가 시작할 때 생성 SDK에 신규 엔드포인트가 없는 상태였음. **S4 에이전트가 이를 스스로 발견하고 `export_openapi.py`+`pnpm generate`를 직접 실행해 해결** — 제 프로세스 실수를 에이전트가 자체 복구. 이후 태스크(39+)에서는 백엔드+웹을 한 워크플로우에 묶을 때 계약 재생성을 명시적 단계로 넣도록 유의.
2. **엔티티/씬 화면의 mock `updateSuggestion` UI가 죽은 코드가 아니었음** — task 37에서 발견한 죽은 ghost-text 경로와는 다른 기능(메모리 패널의 "AI 동적 업데이트 제안" 카드)으로, 실제로 살아있는 UI라 확인 후 그대로 실 데이터로 교체(단일→배열 `pendingSuggestions[]`로 확장).
3. **`TimelineService.create_timeline_state`에 `source` 파라미터 추가**(기본값 `author` 유지, 하위호환) — task 31 설계가 `source=ai_suggested` 계약을 이미 준비해뒀던 것을 이번에 처음 실사용.

## 검증 (UAT)

- api: `task lint`(신규 코드 0 에러) / `task test`(780 passed, 1 skipped, 12 failed 전부 무관 baseline). 실 LLM 호출 1건(추출) 통과, 마크다운 코드펜스로 감싸인 GLM 응답을 못 파싱하던 실버그 발견·수정.
- web: `pnpm typecheck`/`lint`(176 files)/`test`(124 tests) 전부 통과.
- **S4의 실 브라우저 e2e(browse 스킬, 실 GLM-4.6 호출)**: 회원가입→작품 생성→새 인물명 언급 씬 저장→`extract-updates` 자동 호출(~41초)→"AI 동적 업데이트 제안" 카드 5개 렌더(한글 설명 정확)→반영 클릭→World Bible에 실제 엔티티 카드 생성 확인, 무시 클릭→카드 제거 확인. 콘솔 에러 없음.
- DoD 충족: 씬 저장 시 신규 설정 제안이 뜨고, 승인 시 실제 반영, 거절 시 데이터 불변.
