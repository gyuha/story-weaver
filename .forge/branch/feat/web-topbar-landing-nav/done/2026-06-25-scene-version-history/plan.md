<!-- forge-slug: scene-version-history -->
<!-- task: 9 -->
<!-- tdd: off -->
# 씬 버전 기록 모달 (시간대별 보기 · 현재로 보내기 · 인라인 단어 diff)

## Goal / Non-goals
- Goal: 집필(write) 화면에서 현재 씬의 **버전 기록**을 모달로 연다. 모달은 좌측에 시간대별 버전 목록(최신순, "현재" 표시), 우측에 선택 버전의 읽기 전용 본문을 보여주고 — 과거 버전을 **현재로 보내기**(현재 씬 본문 덮어쓰기)하거나, **diff 보기** 토글로 선택 버전↔현재의 변경분을 인라인 단어 diff(추가=초록, 삭제=빨강 취소선)로 비교한다. 편집은 현재 버전만, 과거 버전은 읽기 전용.
- Non-goals: 실제 백엔드/영속 저장, 자동 스냅샷 생성 정책, 현재로 보내기 시 새 스냅샷 적재, 화/작품 단위 기록, side-by-side diff, diff 라이브러리 도입. 모두 이번 mock UI 범위 밖.

## Source of truth
- Glossary terms: [[버전 기록]](Version History), [[씬]] in `.forge/branch/feat/web-topbar-landing-nav/CONTEXT.md` (이번 그릴링에서 버전 기록 확정 — 타임라인 상태와 다른 축)
- Related ADRs: none
- Definition of Done: `/works/<id>/write/<sceneId>`에서 "버전 기록" 버튼 → 모달 오픈. 좌측 버전 목록(최신순·현재 표시), 항목 선택 시 우측에 그 버전 본문(읽기 전용). `현재로 보내기` → 현재 씬 본문이 그 버전으로 교체 + 토스트. `diff 보기` 토글 → 선택 버전과 현재의 단어 단위 차이가 추가=초록·삭제=빨강 취소선으로 인라인 표시. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 모달·선택·현재로보내기·diff 토글 육안 확인.

## Work slices
- [ ] S1. 버전 데이터 + 복원 액션 — `Scene` 타입에 `versions?: { id: string; savedAt: string; paragraphs: Paragraph[] }[]`(최신순) 추가, mock의 씬 2~3개에 스냅샷 시드. `works.store.ts`에 `restoreSceneVersion(workId, sceneId, versionId)` = 해당 버전의 paragraphs로 현재 씬 `paragraphs` 덮어쓰기(immer, 기존 액션 패턴) — 완료 기준: 타입·시드·액션 추가, `pnpm typecheck` 통과.
- [ ] S2. 버전 기록 모달 — write 화면(제목/액션칩 영역)에 "버전 기록" 진입 버튼, 기존 `useModal`/`openModal`(custom modal) 또는 자체 오버레이로 모달 표시. 좌측 버전 목록(최신순 타임스탬프, 맨 위 "현재"), 클릭 시 우측에 선택 버전 본문 읽기 전용. `현재로 보내기` 버튼 → `restoreSceneVersion` 호출 + 토스트 + 모달 반영 — 완료 기준: playwriter로 버튼→모달→버전 선택→읽기전용 본문→현재로 보내기(본문 교체) 확인. (depends: S1)
- [ ] S3. 인라인 단어 diff — 새 util에 단어 단위 LCS diff(의존성 0, ~40줄: 공백 기준 토큰화 → LCS → added/removed/equal 토큰열). 모달의 `diff 보기` 토글로 선택 버전→현재 비교를 추가=초록·삭제=빨강 취소선 인라인 렌더. 끄면 본문만 — 완료 기준: playwriter로 diff 토글 시 추가/삭제 강조가 보이고 끄면 사라짐 확인, `pnpm lint` 통과. (depends: S2)

## 비고 (eco)
- diff는 새 라이브러리 없이 직접 구현(// eco: 단어 LCS diff, 대용량/문자단위 필요 시 라이브러리로 교체). 버전 데이터는 mock 시드 + ephemeral — 현재로 보내기는 현재 본문만 덮어쓰고 새 스냅샷은 안 만듦(YAGNI).
- 모달은 기존 `src/stores/modal-store`의 custom 모달 재사용 가능하면 그쪽으로(최소 신규 코드).
