<!-- forge-slug: chapter-version-history-2of2 -->
<!-- task: 73 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 화 버전 기록 (2/2): 죽은 모달을 실 API에 배선하고 되돌리기를 만든다

## Goal / Non-goals
- Goal: 1of2의 조회 API로 `pnpm generate`한 뒤, `버전 기록` 모달의 좌측을 실제 이력으로 채운다 — 미저장 편집분을 버전이 아닌 별도 항목으로 분리, 최신 저장분에 `최신` 배지, 항목마다 글자 수와 직전 대비 증감, `오늘/어제/날짜` 그룹 헤더와 상대 시각, `더 보기` 페이지네이션. 비교(diff)의 "현재"를 스토어의 저장분이 아닌 **에디터의 실시간 텍스트**로 바꾼다. `이 버전으로 되돌리기`는 미저장 편집분을 먼저 저장한 뒤 선택 버전 본문을 PATCH해 이력을 보존한다. 목(mock)으로만 존재하던 `Chapter.versions`와 `restoreChapterVersion`을 걷어낸다.
- Non-goals: 백엔드 변경 전부(1of2). 두 과거 버전 간 비교(기준은 `선택 버전 → 현재` 고정). 버전 삭제·이름 붙이기. 되돌리기 확인 다이얼로그(자동 선저장으로 대체 — ADR 260805-214733). side-by-side diff·diff 라이브러리 도입(기존 인라인 단어 diff 유지). 읽기 모드·`검토 · 타임라인` 화면에서 버전 기록 진입점 추가(집필 화면 칩 하나 유지). 시놉시스 버전 기록.

## Source of truth
- Glossary terms: [[버전 기록]], [[화]], [[화 요약]], [[늘려쓰기]], [[편집 모드]] in `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/260805-214733-version-as-append-on-save-snapshot.md`(스냅샷 시점·되돌리기 의미·자동 선저장), `.forge/adr/260805-082723-base-ui-dialog-for-stacked-modals.md`(이 모달 위에 무언가를 겹쳐야 하면 Base UI `Dialog`로만 — `useModal`은 `Modal.Ground`의 stacking context 때문에 z-index로도 못 올라간다), `.forge/adr/0006-code-first-openapi-contract-pipeline.md`(SDK는 손으로 쓰지 않고 `pnpm generate`로 받는다)
- Definition of Done: `/works/$workId/write/$chapterId`에서 칩 줄의 `버전 기록`을 누르면 실제 저장 이력이 최신순으로 보인다. `저장`을 두 번(내용을 바꿔가며) 누르면 항목이 둘 늘고 맨 위 항목에 `최신` 배지가 붙는다. 저장하지 않은 편집이 있으면 맨 위에 `편집 중 · 미저장`이 버전과 구분되어 뜬다. 과거 항목을 골라 `diff 보기`를 켜면 그 버전에서 **현재 에디터 본문**까지의 변경분이 초록/빨강으로 보인다. `이 버전으로 되돌리기`를 누르면 원고가 그 본문으로 바뀌고 목록에 항목이 둘 늘어난다(미저장분 + 되돌린 결과) — 되돌리기 직전 상태로 다시 되돌릴 수 있다. `pnpm typecheck` · `pnpm lint` · `pnpm test` 전량 통과, playwriter로 위 흐름 육안 확인.

## Work slices
- [ ] S1. SDK 생성 + 목 제거 — `pnpm generate`로 `src/api` 재생성, `features/editor/api/manuscript.api.ts`에 버전 목록·단건 래퍼 추가. `Chapter.versions`·`ChapterVersion`(목 타입)·`works.store.ts`의 `restoreChapterVersion`을 제거하고 `manuscript.test.tsx`가 잡고 있는 그 목(34·41·49행)도 함께 정리 — 완료 기준: `pnpm typecheck` 통과하고 `grep -rn "restoreChapterVersion\|versions?:" web/src`가 0건, `pnpm test` 전량 초록.
- [ ] S2. 목록 조회 + C안 좌측 — 모달 오픈 시 TanStack Query로 첫 페이지(30개)를 받아 렌더. 항목은 `상대 시각 + 절대 시각`·`N,NNN자`·증감(`+128`/`−410`, 가장 오래된 항목은 생략), 맨 위 저장분에 `최신` 배지, `오늘`/`어제`/`MM-DD` 그룹 헤더, 마지막에 `더 보기 (N개 남음)`. 미저장 편집분이 있으면 목록 위에 `편집 중 · 미저장` 항목(버전 아님을 시각으로 구분). 이력이 없으면 `기록 없음` 유지 — 완료 기준: vitest로 ① 그룹 경계가 자정을 넘어 갈리는 것(시각을 고정해 테스트) ② 증감 부호와 가장 오래된 항목의 증감 생략 ③ 미저장 항목이 버전 목록에 섞이지 않음 ④ `더 보기`로 다음 페이지가 **누적**되고 중복되지 않음 — 네 개가 각각 red → green. (depends: S1)
- [ ] S3. 실시간 `현재` + 선택 버전 본문 — `manuscript.tsx:636`이 넘기는 `currentText`를 `chapter.paragraphs` 대신 에디터의 현재 텍스트로 바꾼다(`editor.getText({ blockSeparator: '\n' })`, 이미 `latestBodyRef`가 그 값을 들고 있다). 항목을 고르면 단건 조회로 본문을 받아 읽기 전용 렌더하고, `diff 보기`는 그 본문에서 현재 텍스트까지의 변경분을 보인다. 미저장 여부는 `현재 텍스트 !== 최신 버전 본문`으로 판정 — 완료 기준: vitest로 ① 저장 없이 에디터를 고친 뒤 diff에 그 변경분이 나타남 ② 저장 직후에는 최신 항목과 현재의 diff가 비어 있음 ③ 미저장 항목의 표시가 ①/②에서 각각 켜지고 꺼짐. (depends: S2)
- [ ] S4. 되돌리기 — `현재로 보내기` 버튼을 `이 버전으로 되돌리기`로 바꾸고 옆에 `현재 본문은 새 버전으로 보존됩니다`를 깔아 유실 없음을 밝힌다. 누르면 ① 미저장 편집분이 있으면 먼저 `PATCH {body: 현재텍스트}` ② `PATCH {body: 선택버전본문}` ③ 목록 invalidate ④ `editor.commands.setContent`로 본문 교체 + 스토어 반영 + 토스트. **①이 실패하면 ②를 진행하지 않는다**(진행하면 미저장분이 유실되고 이 기능의 존재 이유가 깨진다) — 완료 기준: vitest로 ① 미저장분이 있을 때 PATCH가 두 번, 순서대로 호출됨 ② 선저장이 reject되면 두 번째 PATCH가 호출되지 않고 에디터 본문이 그대로이며 에러 토스트가 뜸 ③ 미저장분이 없으면 PATCH가 한 번 ④ 성공 후 목록이 재조회됨 — 각각 red → green. (depends: S3)

## 검증 노트

**그릴링 중 실측한 것** (근거를 남긴다 — 실행 중 재확인 불필요)
- **화면 경로**: 집필 화면은 `src/routes/works/$workId/write/$chapterId.tsx`(확인: `find src/routes -name "*.tsx" | grep write`). 읽기 모드는 `/works/$workId/read/$chapterId`(확인: `manuscript.tsx:617`의 `to`).
- **정확한 UI 레이블**: 진입 버튼은 집필 화면 제목 아래 **칩 줄**의 `버전 기록`(확인: `manuscript.tsx:431` `<ActionChip icon={History} label="버전 기록" ...>`). 저장 칩은 `저장`(`:423`). 모달 헤더는 `버전 기록 · {화 제목}`, diff 토글은 `diff 보기`, 현행 복원 버튼은 `현재로 보내기`, 좌측 라벨은 `현재` / `편집 중 (현재 버전)` / `이전 버전` / `기록 없음`(확인: `version-history-modal.tsx` 전문 열람).
- **`현재로 보내기`는 UI 문자열로 한 곳뿐**(`version-history-modal.tsx:110`). 나머지 3건은 주석·JSDoc이고 테스트 파일에는 없다(확인: `grep -rn "현재로 보내기" web/src` 전수). 그래도 일괄 치환하지 않는다 — `저장`은 `저장`/`요약 저장`/`화 저장`이 공존해 #71에서 6곳이 깨졌다.
- **모달은 목이 아니라 죽은 UI다**: `mock/works.ts`에 `versions` 시드가 0건이고(확인: `grep -n "versions" src/features/shared/mock/works.ts`), `setWorkChapters`가 서버 응답으로 `work.chapters`를 전량 교체하므로(확인: `works.store.ts:124-128` 열람) `chapter.versions`는 항상 `undefined`다. 즉 화면은 영구히 `기록 없음`이었다.
- **`currentText`가 에디터를 안 본다**: `manuscript.tsx:636`이 `currentText={chapter.paragraphs.map((p) => p.text).join('\n')}` — 스토어의 저장된 문단이다.
- **`restoreChapterVersion`을 목으로 잡는 테스트가 있다**: `manuscript.test.tsx` 34·41·49행.
- **`version-history-modal.tsx`와 `lib/word-diff.ts`에 전용 테스트 파일이 없다**(확인: `ls src/features/editor/components/__tests__/` → manuscript·selection-ai-menu·suggestion-picker·summary-modal 4개, `ls src/features/editor/lib/__tests__/` → hydrate-chapters·parse-suggestions 2개).
- **이 모달은 `useModal`이 아니라 자체 오버레이**(`version-history-modal.tsx:24` `fixed inset-0 z-50`)다. 위에 무언가를 겹칠 일이 생기면 ADR `260805-082723`이 적용된다.
- **상대 시각·날짜 포맷 유틸이 저장소에 없다**(확인: `grep -rn "Intl\.\|toLocale" web/src` → `components/ui/calendar.tsx` 2건뿐). 랜딩의 `12분 전`과 상태바의 `오후 2:34`는 하드코딩 목업이다. 새로 만든다.

**확인 필요** (실행 중 실측할 것 — 지금은 근거 없음)
- **되돌린 뒤 화를 떠나면 자동 저장이 또 PATCH를 보낼 것이다.** `setContent`가 `onUpdate`를 쏘므로(회고 `260805-083512` 실측) `latestBodyRef`가 갱신되고, 언마운트 정리는 `body !== initialBody`로만 판정하는데 `initialBody`는 마운트 시점 값이다(`manuscript.tsx:294-327`). 서버 dedup이 버전은 막지만 **재임베딩 1회가 헛돈다**. `initialBody`를 갱신 가능한 ref로 바꿀지, 감수할지 실측해 정한다.
- **`더 보기`의 구현 수단.** 저장소에 페이지네이션 선례가 없다(1of2의 검증 노트 참조). `useInfiniteQuery`와 수동 offset 상태 중 어느 쪽이 이 모달에 맞는지 실측해 고른다 — 누적·중복 방지는 어느 쪽이든 S2의 완료 기준 ④가 잡는다.
- **글자 수 규칙 일치.** 서버가 `char_length(body)`로 내려주는 값이 상태바의 `chars`(`manuscript.tsx:132`, 에디터 스토어에서 옴)와 다르면 두 숫자가 어긋나 보인다. 1of2에서 못 맞췄으면 여기서 표시를 보정한다.

**재발 위험 (직전 회고 `260805-083512`의 "다음에 다르게 할 것")**
- **목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다** — 이 저장소에서 네 번 났고 직전 사이클에서는 `stop()` 목이 `isStreaming`을 안 내려 "닫기 후 원고 무변경"이 거짓 초록이었다. 이번 되돌리기는 `PATCH → PATCH → invalidate → setContent`의 4단이라 정확히 같은 지형이다. `updateChapter` 목을 `vi.fn()`으로만 두지 말고 **reject·순서·invalidate 후 재조회까지 재현**한다. 특히 S4의 완료 기준 ②(선저장 실패 시 되돌리기 중단)는 목이 성공만 흉내면 통째로 검증되지 않는다.
- **jsdom이 관측 못 하는 것을 테스트로 증명했다고 적지 말 것** — 그룹 헤더의 sticky 여부, `최신` 배지의 위치, 목록 스크롤, 증감 색상의 대비, 모달 폭에서 두 줄 항목이 넘치는지는 **브라우저에서만** 확인된다. 테스트는 메커니즘(그룹 경계 분할, 증감 부호, 항목 순서, 호출 순서)만 고정한다.
- **UAT에서 형태가 바뀔 수 있는 지점** (미리 적어 라운드를 줄인다 — 이 항목이 없어 #71에서 UI가 네 번 바뀌었다): ① `더 보기`의 위치·문구와 남은 개수 표기 ② `편집 중 · 미저장` 항목의 시각 강도(점선 테두리·노란 배경이 과한지) ③ 증감 표시의 유무와 색 ④ 그룹 헤더의 sticky 여부 ⑤ 상대 시각과 절대 시각의 병기 방식(둘 다 vs 툴팁) ⑥ `이 버전으로 되돌리기` 옆 보조 문구의 길이. 그릴링에서 fg-visual로 C안까지 좁혀 놨으니(`.forge/visual/`에 목업 보존) 이 여섯 개는 미세 조정 범위여야 한다.
- **방어를 하나씩 제거해 red를 확인하는 절차는 유지.** 이번 방어는 넷 — 선저장 실패 시 중단, 미저장 판정, 그룹 경계 계산, `더 보기` 누적의 중복 제거.
