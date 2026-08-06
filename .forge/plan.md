<!-- forge-slug: version-diff-page-1of2 -->
<!-- task: 74 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 버전 비교 페이지 (1/2): 전용 라우트와 react-diff-viewer-continued 좌우 diff

## Goal / Non-goals
- Goal: `/works/$workId/versions/$chapterId` 전용 페이지를 만든다. 좌측에 기존 버전 목록(날짜 그룹·상대 시각·증감·`최신` 배지·`더 보기`)을 그대로 두고, 본문 영역은 **`react-diff-viewer-continued`의 split view**로 채운다 — 문단 단위 정렬 + 바뀐 문단 안 어절 강조(`compareMethod: WORDS`), 안 바뀐 문단은 `showDiffOnly`로 접는다. 목록 항목 클릭으로 **좌(기준)/우(비교)** 두 지점을 찍고 기본값은 `좌 = 클릭한 버전 / 우 = 현재(최신 버전)`다. 라이브러리 기본 테마(코드용)를 `styles`로 이 프로젝트의 산문 톤에 맞춘다.
- Non-goals: 진입 배선과 모달 제거(2of2 — 이번엔 칩이 여전히 모달을 열고 페이지는 URL로만 접근). 되돌리기 동작(2of2). 선저장 기계장치 제거(2of2). 기존 `word-diff.ts` 제거(모달이 아직 쓴다 — 2of2). 세 버전 이상 비교. 문자 단위 diff. 화 사이 이동(한 화의 이력만). 버전 삭제·이름 붙이기·검색. 문법 강조(`renderContent`) 사용.

## Source of truth
- Glossary terms: [[버전 기록]], [[화]], [[화 요약]], [[편집 모드]] in `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/260805-214733-version-as-append-on-save-snapshot.md`(버전 = 저장한 결과, 되돌리기 = 복사-붙이기, 최신 버전 = 현재 상태의 거울), `.forge/adr/260805-082723-base-ui-dialog-for-stacked-modals.md`(페이지 위 확인창은 Base UI `Dialog`)
- Definition of Done: `/works/{workId}/versions/{chapterId}`를 주소로 열면 좌측에 그 화의 버전 목록이, 우측에 `좌 = 최신 직전 버전 / 우 = 현재`의 좌우 분할 diff가 뜬다. 목록 항목을 클릭하면 좌(기준)가 그 버전으로 바뀌고 diff가 갱신된다. **긴 문단이 가로 스크롤 없이 줄바꿈되어** 좌우가 나란히 읽히고, 바뀐 문단만 배경이 깔리며 그 안 바뀐 어절이 진하게 표시되고, 안 바뀐 문단은 접혀 있다. `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과, 브라우저로 육안 확인.

## Work slices
- [ ] S1. **스파이크 — 산문 줄바꿈 성립 여부**(이 작업의 성패를 가르는 단일 지점). `pnpm add react-diff-viewer-continued` 후, 실제 원고 두 벌(문단 200자 이상 포함)을 `splitView` + `compareMethod: WORDS` + `hideLineNumbers`로 렌더해 **가로 스크롤 없이 줄바꿈되는지** 브라우저에서 확인한다. 안 되면 `styles`로 `white-space: pre-wrap` / `word-break` / 셀 `max-width`를 주입해 되는지 시도한다. 함께 잰다: 빌드 번들에 `refractor`·`js-yaml`이 실제로 들어가는지(`pnpm build` 후 산출물 검색) — 완료 기준: **줄바꿈되는 설정을 찾아 스크린샷으로 남긴다.** 방법이 없으면 여기서 멈추고 대안(`diff`(jsdiff) 직접 + 자체 렌더)을 들고 재그릴링한다 — 이 경우 S2~S4는 진행하지 않는다.
- [ ] S2. 페이지 라우트 + 목록 이전 — `src/routes/works/$workId/versions/$chapterId.tsx` 신설(기존 `read/$chapterId.tsx`·`write/$chapterId.tsx`와 같은 층). 모달의 목록 렌더(`VersionGroups` 198행·`VersionRow` 239행, `data-testid="version-item"`)와 `version-time.ts`의 포맷터 4개를 **공용 컴포넌트로 옮겨 모달과 페이지가 함께 쓰게** 한다(모달은 2of2까지 살아 있어야 한다). 상단에 `← 집필로` 복귀 링크와 `버전 기록 · {화 제목}` — 완료 기준: 주소로 열면 목록이 서버 데이터로 뜨고 `더 보기`가 누적되며, **모달의 기존 테스트가 그대로 통과한다**(공용화 회귀 없음). (depends: none)
- [ ] S3. diff 렌더 배선 + 테마 매핑 — 좌·우 두 지점의 본문을 각각 단건 조회(`.../versions/{id}` — 목록에는 `body`가 없다)해 `oldValue`/`newValue`로 넘긴다. `splitView` · `compareMethod: WORDS` · `hideLineNumbers` · `showDiffOnly` + `extraLinesSurroundingDiff`. `styles`로 라이브러리의 코드용 기본값(모노스페이스·코드 배경)을 프로젝트 토큰(`paper`·`ink`·`line`·serif 본문)에 맞추고, 추가=초록·삭제=빨강 취소선을 기존 모달 diff와 같은 색 계열로 맞춘다 — 완료 기준: vitest로 ① `oldValue`/`newValue`에 두 지점의 본문이 정확히 전달된다 ② 한 어절만 바뀐 입력에서 변경 행이 하나만 나온다 ③ 조회 실패 시 에러 문구가 뜨고 빈 diff를 렌더하지 않는다. 색·폰트는 테스트가 아니라 **브라우저로 확인**(jsdom이 못 본다). (depends: S1, S2)
- [ ] S4. 좌/우 두 지점 선택 — 목록 항목 클릭 = **좌(기준) 이동**(우는 현재 고정), 항목의 `우로 지정` 마커(hover 노출)로 우를 옮긴다. 좌·우로 찍힌 항목에 서로 다른 색 배지(`좌`/`우`). 좌가 우보다 새 버전이어도 그대로 비교한다(순서 강제는 비목표) — 완료 기준: vitest로 ① 항목 클릭 시 좌만 바뀌고 우는 그대로 ② `우로 지정`으로 우만 바뀐다 ③ 좌·우가 같은 버전이면 diff가 비고 `변경 없음` 문구가 뜬다 ④ 두 배지가 서로 다른 항목에 붙는다. (depends: S3)

## 검증 노트

**그릴링 중 실측한 것**
- 라이브러리: `npm view react-diff-viewer-continued` → **`4.4.0`**, peerDeps `react ^15||^16||^17||^18||^19` — 이 프로젝트는 `react ^19.0.0`(package.json 확인)이라 맞다.
- 딸려오는 dependencies 7개와 unpacked 크기(`npm view <pkg> dist.unpackedSize`): `react-diff-viewer-continued` 1149KB · `refractor` 1070KB · `js-yaml` 1419KB · `@emotion/react` 798KB · `@emotion/css` 267KB · `diff` 601KB · `classnames` 23KB · `memoize-one` 35KB. **이 프로젝트에는 emotion·diff·classnames·memoize-one이 하나도 없다**(`grep -E "emotion|\"diff\"|classnames|memoize" package.json` → 0건) — 즉 전부 신규다. Tailwind v4 옆에 **emotion이라는 두 번째 스타일 시스템**이 들어온다. unpacked 크기는 번들 크기가 아니므로 S1에서 실측한다.
- 기능 대응(README 확인): `splitView`(기본 true) · `compareMethod`에 `WORDS` 존재 · `showDiffOnly`(기본 true) + `extraLinesSurroundingDiff`(기본 3) · `hideLineNumbers` · `styles`(emotion 기반 override) · `useDarkTheme`. **확정한 C안(문단 옅게 + 단어 진하게)과 접기 요구가 라이브러리 기본 동작으로 덮인다** — 직접 만들려던 문단 정렬 유틸이 불필요해졌다.
- 문법 강조는 `renderContent`로 **선택**이라고 README가 밝힌다(Prism을 사용자가 직접 붙이는 구조). 다만 `refractor`·`js-yaml`이 `dependencies`에 박혀 있어 설치는 되며, 번들 포함 여부는 별개다 → S1에서 잰다.
- 라우트 관례: `find src/routes -name "*.tsx"` → `works/$workId/read/$chapterId.tsx`·`works/$workId/write/$chapterId.tsx`가 같은 층. 새 페이지는 `works/$workId/versions/$chapterId.tsx`. `routeTree.gen.ts`는 생성물이라 손대지 않는다.
- 재사용 조각: `version-time.ts`가 `formatClockTime`·`formatRelativeTime`·`dateGroupLabel`·`formatCharDelta`를 export(grep 확인). `version-history-modal.tsx`에 `VersionGroups`(198행)·`VersionRow`(239행, `data-testid="version-item"`)·`DiffView`(284행)가 있다.
- API 계약(#72 확정, `docs/openapi.json`): 목록은 `{ items: [{ id, createdAt, charCount, charDelta, hasSummary }], total }`로 **`body`가 없다** → 좌·우 본문은 각각 단건 조회가 필요하다. `limit` 1~100, 가장 오래된 항목의 `charDelta`는 `null`.
- 이 작업의 출발점이 된 치수: 모달 `w-[760px]` − 목록 `w-52`(208px) = 본문 550px → 좌우로 나누면 컬럼당 글줄 약 220px(한 줄 14~15자). 페이지로 옮기는 이유다.

**확인 필요** (실행 중 실측할 것 — 지금은 근거 없음)
- **긴 산문 문단의 줄바꿈**(S1의 전부). README가 "long line handling: not explicitly documented, 가로 스크롤을 언급"이라 코드용 동작일 가능성이 있다. 성립하지 않으면 이 라이브러리로는 산문 좌우 비교가 안 된다.
- **번들에 `refractor`·`js-yaml`이 실제로 들어가는가.** `dependencies`에 있다는 것과 번들에 포함된다는 것은 다른 명제다(모듈 최상위 import 여부에 달렸다). `pnpm build` 산출물에서 확인한다.
- **emotion과 Tailwind v4의 공존.** 스타일 주입 순서·특이도 충돌이 나는지, SSR이 없으니 문제없는지 실측한다.
- **"현재"를 무엇으로 잡을지.** 이 페이지에는 에디터가 없다. ADR 불변식대로면 `최신 버전 == chapters.body`라 **우측 기본값 = 최신 버전**이면 충분하다. 다만 1of2 시점에는 칩이 아직 모달을 열고 페이지는 URL 직접 접근이라, 미저장 편집분이 남은 채로 페이지에 올 수 있어 우측이 실제 원고와 어긋난다. 2of2가 진입 시 선저장을 붙여 이 창을 닫는다 — **1of2 UAT에서 이 어긋남을 관측해 기록할 것.**
- **긴 화의 렌더 비용.** 실제 원고 중 가장 긴 화로 재 본다. `showDiffOnly`가 기본 true라 대부분 접히므로 괜찮을 가능성이 높지만 근거 없이 넘기지 않는다.

**재발 위험 (직전 회고 `260805-083512` + #73 리뷰)**
- **jsdom이 관측 못 하는 것을 테스트로 증명했다고 적지 말 것** — 줄바꿈·좌우 정렬·4단계 색 대비·모노스페이스가 serif로 바뀌었는지·접힘 줄의 시각 강도는 **브라우저에서만** 확인된다. 테스트는 데이터 전달과 구조만 고정한다. S1은 애초에 스파이크라 산출물이 스크린샷이다.
- **레이블·컴포넌트를 파일 전체 치환하지 말 것.** 모달과 페이지가 2of2까지 **같은 목록 컴포넌트를 공유**하므로, 옮기며 이름을 바꾸면 모달 테스트가 조용히 깨진다(직전 사이클에 6곳이 깨졌다). 옮긴 뒤 모달 테스트 통과를 반드시 확인한다.
- **UAT에서 형태가 바뀔 수 있는 지점**(미리 적어 라운드를 줄인다): ① `extraLinesSurroundingDiff` 값(기본 3이 적절한지) ② `좌`/`우` 배지의 색·위치 ③ `우로 지정` 마커를 hover로 감출지 항상 보일지 ④ 바뀐 문단 배경 농도와 어절 강조의 대비 ⑤ 목록 사이드바 폭(모달의 208px보다 넓힐지) ⑥ 줄 번호를 완전히 숨길지 문단 번호로 남길지.
- **라이브러리를 얇게 쓸 것(eco).** `styles` override로 충분한 것을 감싸는 래퍼 컴포넌트로 추상화하지 않는다. 지금 필요한 것은 페이지 한 곳의 사용이다.
