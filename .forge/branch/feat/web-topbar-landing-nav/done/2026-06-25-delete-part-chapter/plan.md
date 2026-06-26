<!-- forge-slug: delete-part-chapter -->
<!-- task: 11 -->
<!-- tdd: off -->
# 부·화 삭제 기능 (⋯ 메뉴 + 복구 불가 경고 + 삭제 후 재번호)

## Goal / Non-goals
- Goal: 작업트리의 부/화 행에 `⋯` 메뉴를 달아 **삭제**를 제공한다. 삭제는 **복구 불가 경고** 확인 다이얼로그를 거친다. 삭제 후 표시 순서를 재정렬한다 — 화 삭제 시 그 부의 남은 화를 1부터 연속 재번호, 부 삭제 시 그 부에 속한 모든 화·씬을 함께 제거(cascade)하고 남은 "제N부…" 라벨의 숫자를 앞으로 당겨 재번호한다. 표시 번호(`index`/`제N부`)는 화면용일 뿐, 글·히스토리·라우팅은 id 기준이라 재번호는 데이터에 안전.
- Non-goals: 드래그로 수동 순서 변경, 삭제 복구/undo, 실 API·영속화, 부를 수동으로 위/아래 이동, 비-"제N부" 커스텀 라벨(예: "외전")의 숫자 재번호(패턴 미일치 라벨은 건드리지 않음).

## Source of truth
- Glossary terms: [[부]], [[화]], [[씬]] in `.forge/branch/feat/web-topbar-landing-nav/CONTEXT.md` (표시 번호는 화면용, 식별은 id — `docs/data-model.md`의 id 기반 계층과 일치)
- Related ADRs: none
- Definition of Done: 트리 부/화 행에서 `⋯` → "삭제" → "복구할 수 없습니다" 경고 다이얼로그 → 확인 시 삭제. 화 삭제 후 그 부의 남은 화가 1..n 연속 재번호됨. 부 삭제 시 그 부의 화·씬이 모두 사라지고, 남은 "제N부…" 라벨 숫자가 당겨짐(이름 부분 유지). 라우팅·히스토리는 id 기준이라 깨지지 않음(삭제된 씬을 보고 있었다면 기존 "씬 없음" fallback 동작). `pnpm typecheck` + `pnpm lint` 통과, playwriter로 부/화 삭제·경고·재번호 육안 확인.

## Work slices
- [ ] S1. 삭제+재번호 스토어 액션 (`works.store.ts`) — `deleteChapter(workId, chapterId)`: 해당 chapter 제거 후 같은 `partLabel`의 남은 화를 배열 순서대로 `index`=1..n 재부여. `deletePart(workId, partLabel)`: 그 partLabel의 모든 chapter 제거(cascade) 후, 남은 부를 표시 순서대로 훑어 라벨이 `/^제(\d+)부/`에 맞는 것만 running counter로 `제{n}부` 접두 재번호(이름 유지, 미일치 라벨은 카운터 소비 안 함). 기존 immer 패턴 — 완료 기준: 두 액션 추가 + 재번호 로직, `pnpm typecheck` 통과.
- [ ] S2. ⋯ 메뉴 + 삭제 확인 (`work-tree.tsx`) — 부 행·화 행에 `⋯`(MoreHorizontal) 버튼 → 작은 드롭다운 메뉴(로컬 state, 항목: "삭제"). 클릭 시 `useModal`로 확인 다이얼로그(부: "'{라벨}'과 속한 모든 화·씬이 삭제됩니다. 복구할 수 없습니다." / 화: "'{index}화 {제목}'와 씬이 삭제됩니다. 복구할 수 없습니다.") → 확인 시 `deletePart`/`deleteChapter` 호출. 화 행은 Link라 메뉴 버튼은 형제로 배치(중첩 금지) — 완료 기준: playwriter로 부/화 ⋯→삭제→경고→삭제 반영 + 재번호(화 1..n, 부 제N부 당김) 육안 확인, `pnpm lint` 통과. (depends: S1)

## 비고 (eco)
- 새 의존성 0(`useModal`·lucide `MoreHorizontal` 재사용). 드롭다운은 로컬 state 작은 것 — 외부 클릭 닫기는 백드롭 버튼 등 최소 구현. 재번호는 mock 배열 직접 조작(// eco).
