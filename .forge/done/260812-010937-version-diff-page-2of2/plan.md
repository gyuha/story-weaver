<!-- forge-slug: version-diff-page-2of2 -->
<!-- task: 75 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 버전 비교 페이지 (2/2): 진입 전환과 모달·선저장 기계장치 철거

## Goal / Non-goals
- Goal: 집필 화면의 `버전 기록` 칩을 모달 대신 **1of2가 만든 페이지로 보낸다** — 미저장 편집분이 있으면 **먼저 저장을 `await`하고**(실패 시 이동하지 않는다) 이동한다. 페이지에 `이 버전으로 되돌리기`를 붙이고(단순 PATCH 한 번) 성공하면 집필 화면으로 복귀한다. 그리고 **모달과 선저장 기계장치를 철거한다** — 페이지 이동이 저장을 보장하므로 `편집 중 · 미저장` 행·선저장·재진입 잠금이 모두 존재 이유를 잃는다.
- Non-goals: 페이지의 diff·목록 자체(1of2). 좌측 트리(`시놉시스 · World Bible · 검토 · 타임라인`)에 진입점 추가 — 칩 하나로 간다. 되돌리기 확인 다이얼로그(선저장이 대체). 되돌리기에 "복원됨" 라벨. 읽기 모드·검토 화면 진입점. 백엔드 변경 일체(낙관적 동시성 제어 포함).

## Source of truth
- Glossary terms: [[버전 기록]], [[화]], [[편집 모드]], [[늘려쓰기]] in `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/260805-214733-version-as-append-on-save-snapshot.md` — 되돌리기는 전용 엔드포인트 없이 `PATCH .../chapters/{id} { body }`이고, 모든 본문 PATCH가 서버에서 버전을 만든다(직전과 같으면 dedup). **이 ADR의 "미저장분 자동 선저장" Consequence는 이번 작업으로 무효가 된다** — 페이지 이동이 그 역할을 대신하므로, 실행 후 fg-learn에서 ADR 개정 또는 후속 ADR을 검토한다.
- Definition of Done: 집필 화면에서 `버전 기록` 칩을 누르면 **모달이 아니라** `/works/{workId}/versions/{chapterId}`로 이동하고, 미저장 편집분이 있었으면 이동 전에 저장돼 목록 맨 위에 그 버전이 있다. 저장이 실패하면 이동하지 않고 에러 토스트가 뜬다. 페이지에서 `이 버전으로 되돌리기`를 누르면 원고가 그 본문으로 바뀌고 집필 화면으로 돌아온다. `version-history-modal.tsx`·`word-diff.ts`와 `manuscript.tsx`의 선저장 기계장치가 저장소에서 사라진다. `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과, 브라우저로 육안 확인.

## Work slices
- [ ] S1. 칩 → 페이지 이동(저장을 보장하며) — `manuscript.tsx:498`의 `<ActionChip icon={History} label="버전 기록" onClick={() => setShowHistory(true)} />`를 async 핸들러로 바꾼다: 현재 텍스트가 `initialBodyRef.current`와 다르면 `updateChapter({ body })`를 **await**하고 성공 시 `initialBodyRef.current`를 갱신한 뒤 `navigate`, 실패하면 **이동하지 않고** `apiErrorMessage`로 토스트. `initialBodyRef`를 갱신하므로 뒤이은 언마운트 정리(`:330-333`)가 같은 본문을 다시 PATCH하지 않는다(기존 기계장치 재사용 — 새 플래그를 만들지 않는다) — 완료 기준: vitest로 ① 미저장분이 있으면 PATCH 1회 후 이동 ② PATCH가 reject되면 **이동하지 않고** 에디터 본문이 그대로이며 에러 토스트 ③ 미저장분이 없으면 PATCH 없이 바로 이동 ④ 이동 시 언마운트 정리가 추가 PATCH를 쏘지 않는다(총 호출 1회). 각각 red → green. (depends: none)
- [ ] S2. 페이지의 되돌리기 — 1of2 페이지 상단에 `이 버전으로 되돌리기` 버튼과 보조 문구 `현재 본문은 새 버전으로 보존됩니다`. 누르면 좌(기준)로 찍힌 버전의 본문으로 `PATCH .../chapters/{id} { body }` 1회 → 성공 시 목록 invalidate → 집필 화면(`/works/{workId}/write/{chapterId}`)으로 복귀 + 성공 토스트 `이전 버전으로 되돌렸습니다`. 진행 중 버튼 `disabled`. **선저장은 없다**(진입 시 이미 저장됐다) — 완료 기준: vitest로 ① PATCH가 **1회만** 호출되고 body가 좌 버전의 본문이다 ② 성공 후 집필 화면으로 이동한다 ③ 실패 시 이동하지 않고 에러 토스트 ④ 진행 중 버튼이 disabled라 두 번 눌러도 PATCH가 1회. (depends: S1)
- [ ] S3. 철거 — `version-history-modal.tsx`와 `lib/word-diff.ts`, 그 테스트(`__tests__/version-history-modal.test.tsx` 259줄)를 삭제한다. `manuscript.tsx`에서 `showHistory` 상태(`:58`)·모달 렌더(`:699-706`)·`restoreVersion`(`:383-428`)·`restoringRef`(`:96`, `:330`, `:385-386`, `:428`)를 제거하고, `:260`의 `restoreVersion`을 가리키는 주석을 고친다. **`initialBodyRef`(`:124`, `:332`, `:360`)는 남긴다** — 수동 저장의 중복 PATCH 방지용이라 되돌리기와 무관하고, S1이 그것을 쓴다. `manuscript.test.tsx`(1069줄)에서 되돌리기·선저장 관련 테스트만 걷어내고 나머지는 손대지 않는다 — 완료 기준: `grep -rn "VersionHistoryModal\|word-diff\|restoringRef\|restoreVersion" web/src`가 0건, `pnpm test` 전량 초록, `pnpm typecheck`·`pnpm lint` 통과. 삭제로 고아가 된 import만 정리하고 **무관한 코드는 건드리지 않는다**. (depends: S2)

## 검증 노트

**그릴링 중 실측한 것** (근거를 남긴다 — 실행 중 재확인 불필요)
- 철거 대상 위치(`grep -n "showHistory\|setShowHistory\|restoringRef\|restoreVersion\|initialBodyRef" manuscript.tsx`): `showHistory` 상태 58행 / `restoringRef` 96·330·385·386·428행 / `initialBodyRef` 124·332·360·405·425행 / `restoreVersion` 383–428행 / 칩 498행 / 모달 렌더 699–706행 / 260행에 `restoreVersion`을 언급하는 주석.
- **`initialBodyRef`는 두 가지 일을 한다**: 언마운트 정리의 중복 PATCH 방지(`:332`)와 수동 저장 후 기준값 갱신(`:360`). 되돌리기 전용은 `:405`·`:425`뿐이다 — 그 둘만 지우고 ref 자체는 남긴다. #73 리뷰가 `saveChapter`까지 갱신하도록 확장한 이유(수동 저장 후 중복 PATCH)가 여전히 유효하다.
- 삭제 대상 파일 크기: `version-history-modal.test.tsx` 259줄, `version-time.test.ts` 66줄(이건 **남긴다** — 1of2가 페이지에서 계속 쓴다), `manuscript.test.tsx` 1069줄(부분 정리).
- 되돌리기 계약: 전용 엔드포인트가 없고 `PATCH .../chapters/{chapter_id} { body }` 재사용(ADR 260805-214733 + #72 구현). 서버가 버전 append와 재임베딩을 자동으로 한다.
- 라우트: 복귀 대상은 `/works/$workId/write/$chapterId`(`find src/routes` 확인).

**확인 필요** (실행 중 실측할 것 — 지금은 근거 없음)
- **이동 시 언마운트 정리가 정말 조용해지는가.** S1은 "`initialBodyRef`를 갱신하면 언마운트 정리가 스킵된다"에 기대는데, **방어 장치가 있다는 것과 새 경로에서 그것이 실제로 발동한다는 것은 다른 명제다**(#66이 정확히 그 가정으로 실측을 생략해 틀렸다). TanStack Router의 이동이 `ManuscriptEditor`를 실제로 언마운트하는지, 그 시점에 ref가 이미 갱신돼 있는지를 **호출 횟수로 단정하는 테스트**(완성 기준 ④)로 고정한다.
- **되돌리기 후 복귀 시 집필 화면이 새 본문을 보는가.** 스토어 캐시가 낡아 옛 본문이 잠깐 보이는지 실측한다. 낡으면 복귀 전에 스토어를 갱신하거나 화 조회를 invalidate한다.
- **1of2가 남긴 "현재 = 최신 버전" 전제가 이제 성립하는가.** S1이 진입 시 저장을 보장하므로 페이지 도착 시점에 `최신 버전 == chapters.body`여야 한다. 1of2 UAT에서 기록해 둔 어긋남이 실제로 닫혔는지 확인한다.
- **모달 삭제로 `word-diff.ts`가 정말 고아가 되는가.** `grep -rn "word-diff\|diffWords" web/src`로 다른 사용처가 없음을 확인한 뒤 지운다(1of2가 라이브러리로 갈아탔으므로 없을 것이나 근거 없이 지우지 않는다).

**재발 위험 (직전 회고 `260805-083512` + #73 리뷰)**
- **목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다** — 이 저장소에서 네 번 났고, #73의 S4 완성 기준 ②(선저장 실패 시 중단)가 정확히 이 유형이었다. S1의 완성 기준 ②(저장 실패 시 **이동하지 않음**)와 S2의 ③이 같은 모양이다. `updateChapter` 목을 성공만 흉내는 `vi.fn()`으로 두면 통째로 검증되지 않는다 — reject와 navigate 호출 여부까지 재현하라.
- **red가 된다 ≠ 목표 검증.** S1 ④("언마운트 정리가 추가 PATCH를 쏘지 않는다")는 호출 **횟수**를 봐야 한다. "`initialBodyRef`가 갱신됐다"를 단정하는 테스트는 다른 명제다(#71의 `zIndex` 건과 같은 함정).
- **철거는 지우는 작업이라 조용히 과하게 지우기 쉽다.** `manuscript.test.tsx` 1069줄에서 되돌리기 관련만 걷어내야 한다 — 일괄 치환·일괄 삭제 금지. 지운 뒤 남은 테스트 수를 기록해 의도한 만큼만 줄었는지 확인한다.
- **UAT에서 형태가 바뀔 수 있는 지점**: ① 되돌리기 버튼을 페이지 상단에 둘지 좌측 목록 항목마다 둘지 ② 복귀 시 토스트를 집필 화면에서 띄울지 페이지에서 띄우고 이동할지 ③ 진입 시 저장이 느릴 때(대용량 화) 이동이 지연되는 체감 — 진행 표시가 필요한지.
