# RUN — v2-C: 캐릭터 관계도(기본 + 챕터별)

slug: v2c-relationship-graph · task: 44 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

2개 워크플로우로 분리: 1) 백엔드(S1+S2) → 계약 재생성(직접) → 2) 웹(S1+S2 시각화).

## 계획대로 된 것

- **백엔드**: `GET /works/{work_id}/relationships[?up_to_scene_id=X]` — 기본은 인물 엔티티의 `attributes.relations` 그래프, `up_to_scene_id` 지정 시 `relation_to_<entity_id>` 타임라인 상태를 반영 + 저비용 티어 LLM으로 관계 요약 생성(관련 사실 없으면 LLM 미호출).
- **웹**: 그래프 시각화 라이브러리 추가 없이 소스 엔티티별로 그룹핑한 목록으로 렌더(계획의 "단순함 우선" 지침 그대로). World Bible 화면에 "관계도" 진입점 추가, 씬 선택기로 시점별 요약 조회.

## 계획 대비 차이 (divergences)

1. **budget/rate 게이트 일관성 누락을 제가 직접 발견·추가** — 백엔드 에이전트가 이 엔드포인트에 assist/beat-sheet가 갖고 있는 `require_budget_available`+rate limit 게이트를 빠뜻리고 "테스트 목록에 없어서"라고 투명하게 플래그했음. LLM을 호출하는 모든 엔드포인트에 동일 가드를 적용하는 이 저장소의 확립된 관례에 맞춰 직접 추가(`_bind_rate_limit_user`+`@limiter.limit`+`require_budget_available`), 기존 6개 테스트 그대로 통과 확인.
2. **에이전트가 무관한 기존 갭 발견(수정 안 함)**: 엔티티 폼의 자유 텍스트 "관계" 필드가 아직 백엔드의 `target_entity_id` 기반 `attributes.relations`에 연결 안 돼 있음(task 30/33 소관, entity-mapping.ts에 이미 `eco:` 표시로 알려진 갭) — 후속 후보로만 재확인.
3. **네이티브 `<select>` 사용**(설치된 base-ui Select 대신) — 테스트 단순성, 기존 `manuscript.tsx` 티어 선택기와 일관.

## 검증 (UAT)

- api: `task lint`(baseline만) / `task test`(856 passed, 1 skipped, 12 failed 전부 무관). 게이트 추가 후 관계도 테스트 6건 재확인.
- web: `pnpm typecheck`/`lint`(188 files)/`test`(143 tests) 통과.
- **에이전트의 실 브라우저 검증(browse 스킬)**: 회원가입→인증→로그인→작품 생성→"관계도" 진입점 확인→빈 상태 렌더 확인→엔티티 2개+관계 1건 시드 후 재로드→실제 그룹핑 렌더("김철수/사제→이영희(스승과 제자)") 확인.
- DoD 충족: 인물 카드들의 관계가 목록으로 보이고, 챕터 선택 시 그 시점까지의 관계 요약이 표시됨.
