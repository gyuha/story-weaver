<!-- forge-slug: worktree-chapter-part-editing -->
<!-- task: 6 -->
<!-- tdd: off -->
# 좌측 작업트리에 화 추가·부 추가·부 이름변경 기능 추가

## Goal / Non-goals
- Goal: 읽기 전용이던 좌측 작업트리(`work-tree.tsx`)에 (1) 부마다 `+ 새 화` 추가, (2) 트리 맨 아래 `+ 새 부` 추가, (3) 부 이름 인라인 변경 — 세 조작을 더해 사용자가 화/부 구조를 직접 만들 수 있게 한다. mock(Zustand) 스토어를 변경해 트리에 즉시 반영한다.
- Non-goals: 화를 다른 부로 이동, 드래그 순서 변경(`data-model.md`상 v2), 삭제, 실 API 연동, Part 독립 엔티티화(B안 — 이번엔 `partLabel` 문자열 유지).

## Source of truth
- Glossary terms: [[부]](Part), [[화]](=Chapter) in `.forge/branch/feat/web-topbar-landing-nav/CONTEXT.md` (이번 그릴링에서 확정), [[씬]] in `.forge/CONTEXT.md`
- Related ADRs: none
- Definition of Done: 임의의 작품 화면(예: `/works/hoegwija/timeline`) 좌측 트리에서 — 부 끝의 `+ 새 화`로 빈 씬 1개를 가진 화가 그 부에 추가되고(작품 전체 연속 `index` = max+1), 해당 부가 자동 펼쳐지며 제목 인라인 편집에 포커스됨 / 맨 아래 `+ 새 부`로 새 라벨의 부 + 첫 화가 함께 생기고 / 부 행에서 이름을 바꾸면 그 부의 모든 화 `partLabel`이 일괄 갱신됨. `pnpm typecheck` + `pnpm lint` 통과. `docs/data-model.md`의 사용자 대면 "에피소드" 서술이 "부"로 정렬됨.

## Work slices
- [ ] S1. 스토어 액션 3종 추가 (`works.store.ts`) — `addChapter(workId, partLabel)`(빈 씬 1개 가진 Chapter push, `index`=작품 내 max+1, 새 id 생성), `addPart(workId, label)`(새 라벨로 `addChapter` 호출해 부+첫 화 동시 생성, 라벨은 "제N부" 형태 자동 후보), `renamePart(workId, oldLabel, newLabel)`(매칭 화들의 `partLabel` 일괄 교체). 기존 `renameChapter` immer 패턴 그대로 따름 — 완료 기준: 세 액션이 타입 시그니처와 함께 export되고 `pnpm typecheck` 통과.
- [ ] S2. `work-tree.tsx` UI 배선 — 각 부 블록 끝에 `+ 새 화` 버튼(클릭 시 `addChapter` → 그 부 자동 펼침 → 새 화 제목 인라인 편집 포커스), 트리 맨 아래 `+ 새 부` 버튼(`addPart`), 부 행 인라인 rename(`renamePart`; 기존 챕터 rename UX가 있으면 그 패턴 재사용, 없으면 더블클릭/연필 토글 중 단순한 쪽). 빈 씬 추가는 기존 Scene 타입 필수 필드 충족 — 완료 기준: playwriter로 세 조작이 트리에 즉시 반영됨을 육안 확인(새 화/새 부 노출, 이름변경 반영) + `pnpm lint` 통과. (depends: S1)
- [ ] S3. `docs/data-model.md` 용어 정렬 — 사용자 대면 서술의 "에피소드"를 "부"로 교정(코드/DB 식별자 `episodes`/`episode_id`는 `write`/'집필' 선례대로 유지한다는 한 줄 주석 추가). 계층 다이어그램·산문 일관성 유지 — 완료 기준: `docs/data-model.md`에서 사용자 대면 문맥의 "에피소드"가 "부"로 바뀌고 식별자 유지 근거가 한 줄로 남음. (depends: none)

## 비고 (ponytail 천장)
- `partLabel` 문자열 모델 유지(A안): 서로 다른 두 부가 같은 라벨이면 트리에서 병합됨 / 빈 부 불가. mock 단계 수용, 코드에 `// ponytail:` 주석으로 한계 명시. 본격 부 관리 필요 시 Part 엔티티(B안)로 승급.
