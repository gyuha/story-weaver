<!-- forge-slug: synopsis-title-intent -->
<!-- task: 52 -->
<!-- tdd: on -->
# 시놉시스 화면 재구성 — 제목 · 기획의도 편집 + 메뉴 순서 변경

## Goal / Non-goals

- Goal: `/works/{workId}/synopsis` 화면을 "제목"과 "기획의도" 두 필드를 실제로 편집할 수 있는 화면으로 재구성한다(현재는 자리표시자 텍스트만 보여줌). 좌측 메뉴 순서를 "시놉시스 → World Bible → 검토·타임라인"으로 바꾼다.
- Non-goals:
  - 줄거리(기승전결이 있는 서사) 관리 — 이번 범위에서 완전히 제외. 검토·타임라인 쪽 확장 후보로 남기되, 이번 작업엔 포함하지 않는다.
  - 카드 기반 관리·드래그 앤 드롭 순서 변경 — 이전 그릴링에서 검토했으나 폐기(`retired ADR-0011`). 이번 작업과 무관.
  - `BeatSheetPanel`/`POST /works/{work_id}/beat-sheet` 엔드포인트 자체의 삭제 — 화면에서만 빼고, 엔드포인트·컴포넌트 파일은 남겨둔다(다른 화면에서 재사용 가능하도록).
  - 새 DB 스키마·마이그레이션 — 기존 `synopses`(단일 텍스트)와 `works.title`을 그대로 재사용한다.

## Source of truth

- Glossary terms: 시놉시스 (Synopsis, 이번 그릴링에서 재정의) — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/retired/0011-synopsis-as-reorderable-cards.md`(폐기됨 — 참고용, 이번 작업의 근거 아님)
- Definition of Done: `/works/{workId}/synopsis` 화면에서 제목을 클릭해 고치면 blur/Enter 시 자동 저장되고(`PATCH /works/{work_id}`), 다른 화면(사이드바 헤더 등)에도 즉시 반영된다. 기획의도 텍스트 영역도 blur 시 자동 저장된다(`PUT /works/{work_id}/synopsis`). `BeatSheetPanel`은 화면에서 빠졌다. 좌측 메뉴가 "시놉시스 → World Bible → 검토·타임라인" 순서로 보인다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과.

## Work slices

- [ ] S1. **작품 제목 편집 스토어 액션**: `features/shared/store/works.store.ts`에 `renameWork(workId, title)` 액션 추가 — `worksApi.update`(이미 존재, `PATCH /works/{work_id}` 래퍼) 호출 + 로컬 `work.title` 갱신, 기존 `renameChapter` 패턴 그대로 미러링. — 완료 기준(TDD): 스토어 테스트로 `renameWork` 호출 시 API 호출 인자와 로컬 상태 갱신을 확인.

- [ ] S2. **시놉시스 화면 재구성** (depends: S1): `web/src/routes/works/$workId/synopsis.tsx`를 다음과 같이 바꾼다.
  - 제목: 기존 큰 제목 자리를 인라인 편집 입력으로 교체 — 클릭 시 편집, blur/Enter 시 `renameWork` 호출(챕터 제목 편집과 동일한 UX 패턴, `manuscript.tsx`의 `titleDraft`/`commitTitle` 참고).
  - 기획의도: 제목 아래 여러 줄 텍스트 영역 추가 — 마운트 시 `manuscriptApi.synopsis`로 로드, blur 시 `manuscriptApi.updateSynopsis`로 저장. placeholder: "왜 이 작품을 쓰나요? 독자에게 전하고 싶은 메시지는 무엇인가요?" 저장 시 짧은 "저장됨" 표시(다른 화면의 자동 저장 표시 패턴 참고).
  - 기존 인물 엔티티 요약 자리표시자 텍스트, `BeatSheetPanel` 렌더링 제거(컴포넌트 파일·백엔드 엔드포인트는 유지, import만 제거).
  - 통계 카드 3개(화 수/분량/설정 카드 수)는 그대로 유지.
  — 완료 기준(TDD): 신규 테스트로 — 마운트 시 시놉시스 조회 호출 / 제목 blur 시 `renameWork` 호출 / 기획의도 blur 시 `updateSynopsis` 호출 / `BeatSheetPanel` 미렌더링 — 각각 확인.

- [ ] S3. **메뉴 순서 변경**: `web/src/components/layout/work-shell.tsx`의 `NavItem` 3개(World Bible·시놉시스·검토·타임라인) 순서를 "시놉시스 → World Bible → 검토·타임라인"으로 바꾼다. 각 항목의 `active`/`to`/`params`는 그대로. — 완료 기준(TDD): 렌더 순서 테스트(DOM 순서 비교) 신규 작성.

- [ ] S4. **검증** (depends: S2, S3): `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과 + UAT(제목·기획의도 편집 후 새로고침해도 유지되는지, 사이드바 헤더에 바뀐 제목이 반영되는지, 메뉴 순서 확인). — 완료 기준: DoD 충족.
