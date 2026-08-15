<!-- forge-slug: version-diff-page-1of2 -->
<!-- task: 74 -->
# 실행 기록 — 버전 비교 페이지 (1/2)

실행 방식: Dynamic Workflow 1회. 에이전트 8개(S1 스파이크 → S1 독립검증 게이트 → S2 → S3 → S4 → 적대적 리뷰 → 수정 1R → 재리뷰), 순차. 서브에이전트 모델은 eco 설정대로 `sonnet` 고정, 구현 슬라이스는 `web-feature-builder` 도메인 에이전트로 디스패치. TDD 모드 on이라 완료 기준마다 red → green.

## 슬라이스별 결과

- S1 스파이크 — 산문 줄바꿈 성립 여부 실측 — ✅ 계획대로 (단, **결론이 계획의 전제를 뒤집었다** — 아래 참조)
- S2 페이지 라우트 신설 + 목록 공용화 — ✅ 계획대로
- S3 diff 렌더 배선 + 테마 매핑 — ⚠ 실측 중 라이브러리 색 적용 버그를 발견해 추가 대응, 브라우저 확인은 실제 화 주소가 아닌 격리 하네스로 대체
- S4 좌/우 두 지점 선택 — ⚠ 배지 색을 자체 결정, 브라우저 확인 증거(스크린샷)가 남아 있지 않음

검증 — **실행자가 워크플로 종료 후 직접 재실행해 확인한 것**(에이전트 보고를 옮긴 것이 아니다):

| 확인한 명제 | 실행한 명령 | 관측한 출력 |
|---|---|---|
| 타입 검사 통과 | `pnpm typecheck` | 무출력(에러 0) |
| 린트 통과 | `pnpm lint` | `Checked 232 files in 49ms. No fixes applied.` |
| 전체 테스트 통과 | `pnpm test` | `Test Files 54 passed (54) / Tests 379 passed (379)` |
| 모달 테스트 무편집 통과 | `pnpm vitest run .../version-history-modal.test.tsx` | `Tests 9 passed (9)` |
| 모달 변경이 순수 추출인지 | `git diff --stat` + diff 본문에서 레이블·testid 검색 | `2 insertions(+), 94 deletions(-)`, 레이블·`data-testid` 변경 0건 |
| 비목표 침범 없음 | `git status --short <경로>` | `manuscript.tsx`·`word-diff.ts` 출력에 없음(무변경), 두 파일 모두 존재 |
| diff prop 6종 배선 | `grep -n` on `versions-page.tsx` | 217–222행에 6개 전부 |
| 메인 청크 오염 없음 | `pnpm build` 후 `grep -l diffViewerBackground dist/assets/index-*.js` | 0건 |
| 지연 청크 분리 | `ls -la dist/assets/_chapterId-*.js` | `_chapterId-CjuufUDb.js` 147,935바이트 |
| S1 스크린샷 육안 | Read로 PNG 직접 열람 | 줄바꿈·serif·어절 강조 확인(아래 참조) |

작업 전 베이스라인은 52 files / 370 tests(S2 에이전트가 보고) → +2 files / +9 tests.

**red 확인은 에이전트 보고이며 실행자가 재현하지 않았다.** TDD 모드였고 S2~S4가 각 완료 기준마다 "red 확인 후 구현 → green"을 보고했지만, 실행자는 구현을 되돌려 red를 재현해 보지 않았다 — **확인 필요**. 다만 S3의 완료 기준 ②는 목이 아니라 실제 라이브러리를 렌더해 emotion 클래스(`diff-added`/`diff-removed`)를 가진 요소의 `closest('tr')` 집합 크기를 세는 방식이라, "목이 부작용을 안 재현해 실제 경로를 가린다"는 이 저장소의 반복 실패 유형은 최소한 그 항목에서는 피했다(테스트 소스를 실행자가 읽어 확인).

## 계획대로 간 것

- **S1의 게이트가 제 역할을 했다.** 구현자의 자가보고(`ok=true`)를 그대로 믿지 않고 별도 심판 에이전트가 스크린샷만 보고 판정하게 설계했는데, 심판이 두 스크린샷을 실제로 읽어 문단별 줄 수와 강조된 어절 쌍(밤/새벽, 폐허가 된/무너진 등)까지 인용하며 통과시켰다. 게이트가 형식적으로 통과된 게 아니다.
- **모달 회귀 없음.** 계획이 가장 경계한 지점(직전 사이클에 파일 전체 치환으로 6곳이 조용히 깨졌다)인데, `version-history-modal.tsx` diff가 **2 insertions / 94 deletions** — 순수하게 옮겨낸 것만 지워졌고 레이블·`data-testid="version-item"`·컴포넌트 이름이 하나도 바뀌지 않았다. 모달 테스트 9건 무편집 통과.
- **비목표 침범 없음.** `manuscript.tsx` 무변경(진입 배선은 여전히 모달), `word-diff.ts` 무변경, 되돌리기 미구현, 모달 생존. 전부 2/2의 몫으로 남았다.
- 계획이 지정한 6개 prop(`splitView` · `compareMethod=WORDS` · `hideLineNumbers` · `showDiffOnly` · `extraLinesSurroundingDiff` · `styles`)이 그대로 배선됐다.

## 계획과 어긋난 것

**1. S1의 전제가 틀렸다 — 오버라이드가 애초에 필요 없었다.**
계획은 "라이브러리 기본 테마(코드용)를 산문 톤에 맞춰야 한다"를 출발점으로 삼고, 줄바꿈 성립 여부를 최대 5회 실험할 각오로 스파이크를 잡았다. 실측 결과 `react-diff-viewer-continued` 4.4.0은 vanilla `react-diff-viewer`와 달리 `contentText`에 `whiteSpace: pre-wrap` + `lineBreak: anywhere`를 **기본값으로** 갖고 있었다(`lib/cjs/src/styles.js` 직접 확인). 오버라이드 0회로 첫 렌더에서 성공. 이 fork가 코드용이 아니라 범용으로 설계돼 있다는 사실을 계획 단계에서 몰랐다 — README만 봤고 스타일 소스는 안 읽었다. 그릴링에서 `npm view`로 메타데이터는 쟀지만 패키지 소스는 열지 않은 것이 원인이다.

**2. 그 대신 계획에 없던 진짜 버그가 나왔다 (S3).**
`variables.addedColor` / `removedColor`는 **+/- 마커에만** 적용되고, 실제 바뀐 단어 텍스트는 그 사이 `contentText` span의 `ink` 색을 상속해 **초록/빨강이 전혀 보이지 않았다**. `wordAdded` / `wordRemoved`에 `color`를 직접 지정해 고쳤고, 스크린샷 픽셀 샘플링으로 `--success`(84,129,100)·`--danger`(212,76,71) 일치를 확인했다. 이건 문서만 읽어서는 안 나오고 실제로 렌더해 봐야만 나오는 유형이다 — 스파이크의 값이 예상과 다른 데서 나왔다.

**3. 적대적 리뷰가 잡은 major 1건 — 번들 오염.**
`VersionsPage`를 라우트 파일 안에서 `export`하면 `@tanstack/router-plugin`의 `autoCodeSplitting`이 **분리를 건너뛴다**(`compilers.js:449-454`에서 `hasExport()===true`면 `shouldSplit=false`). 그 결과 `react-diff-viewer-continued` + emotion + js-yaml 일체가 **메인 엔트리 청크에 인라인**돼 있었다 — 버전 비교 페이지에 오지 않는 사용자도 전부 받는다. `VersionsPage`를 `features/editor/components/versions-page.tsx`로 옮겨 고쳤다.
- **실행자가 직접 확인한 것**: 수정 후 상태에서 `pnpm build` → `grep -l diffViewerBackground dist/assets/index-*.js` **0건**, `_chapterId-CjuufUDb.js` **147,935바이트** 존재. 즉 "지금 메인 청크가 깨끗하고 라이브러리가 지연 청크에 있다"는 사실이다.
- **에이전트 보고이며 실행자가 재현하지 않은 것**: 수정 *전* 메인 청크 988.16KB(gzip 320.66KB) → 수정 후 817.25KB(gzip 262.59KB)라는 **전후 비교 수치**. 수정 전 상태를 되돌려 다시 빌드하지 않았다. 근본 원인으로 인용된 `@tanstack/router-plugin/dist/esm/core/code-splitter/compilers.js:449-454`(`hasExport()===true`면 `shouldSplit=false`)도 수정자가 소스를 읽었다는 보고이고 실행자는 그 파일을 열어보지 않았다 — **확인 필요**(다만 결과물 grep이 수정의 효과 자체는 입증한다).
→ **이 결함은 테스트로는 절대 안 잡힌다**(vitest 설정에 `tanstackRouter` 플러그인이 없어 코드스플리팅 트랜스폼이 안 돈다). 적대적 리뷰 단계를 넣지 않았으면 그대로 나갔다.

**4. 사이드바 폭을 모달의 208px(`w-52`)이 아니라 256px(`w-64`)로 넓혔다.** 계획이 UAT 변경 가능 지점으로 미리 적어둔 항목(⑤)이다.

**5. 좌/우 배지 색을 실행자가 정했다.** 계획에 "서로 다른 색"만 있고 색 지정이 없어, diff 뷰어가 이미 쓰는 색 언어를 재사용했다 — 좌 = `danger`(빨강, oldValue 쪽), 우 = `success`(초록, newValue 쪽). "최신" 배지는 기존 `primary`(파랑) 유지. 신규 CSS 변수 추가 없음.

**6. 최초 버전(그 이전이 없는 좌)의 처리를 현장에서 정했다.** `더 보기`로 아직 안 받아온 페이지 경계에서 직전 버전을 모를 때 `oldValue=''`로 두어 "전부 새로 추가됨"으로 보여준다. 계획에 없는 엣지케이스지만 실제 도달 가능해 최소 처리했고 `// eco` 주석으로 업그레이드 경로를 남겼다.

## 브라우저 확인 — 어디까지 실제로 봤나 (정직하게)

계획의 "브라우저로 육안 확인"은 **부분적으로만 충족됐다.**

- **`playwriter` MCP가 이 세션에 없다.** PlayMCP가 OAuth 미인증이고 비대화형 세션이라 인증 자체가 불가능하다. `CLAUDE.md`가 지정한 확인 수단이 통째로 빠졌다. 대체로 `pnpm dlx playwright screenshot`을 썼다(브라우저 바이너리는 로컬 캐시에 이미 있었고, 저장소에 devDependency를 추가하지 않았다).
- **S1 스크린샷 2장은 남아 있고 실행자가 직접 눈으로 봤다** — `/tmp/version-diff-spike/01-default.png`(1440px), `02-narrow-1024.png`. 긴 문단이 컬럼 안에서 줄바꿈되고 가로 스크롤·잘림이 없다.
- **S3의 확인은 실제 화 주소가 아니라 격리 하네스였다.** 로컬에 로그인 가능한 계정·시드 데이터가 없어 `/works/{workId}/versions/{chapterId}`에 도달하지 못했고, 대신 같은 `diffViewerStyles` 객체와 실제 `globals.css`로 라이브러리를 단독 렌더해 찍었다(`s3-page.png` 등). 실행자가 이 이미지를 직접 확인했다 — serif 본문, 어절 단위 초록/빨강+취소선, 줄바꿈 모두 확인된다. **다만 좌측 삭제 어절의 배경 농도가 우측 추가 어절보다 눈에 띄게 옅다**(계획이 UAT 변경 지점 ④로 미리 적어둔 항목).
- **S4의 확인은 증거가 남아 있지 않다.** S4는 실행 중인 백엔드(:8000)에 curl로 임시 계정·작품·화·버전 2개를 만들고 zustand persist 키(`sw-auth-v3`)에 토큰을 심어 **실제 페이지를 렌더해 3장을 찍었다**고 보고했고, 확인 후 임시 작품은 API로·임시 계정은 psql로 지웠다고 했다. **그 스크린샷이 어디에도 남아 있지 않아 실행자가 재검증하지 못했다.** 배지 색·hover 마커·"변경 없음" 전환은 **에이전트의 주장일 뿐 확인된 사실이 아니다** — UAT에서 사람이 봐야 한다. dev DB 정리도 마찬가지로 미확인이다.

## 번들 실측 (계획이 "근거 없음"으로 남겨둔 항목)

계획이 이 항목을 "확인 필요"로 남겼으므로, 여기서도 **누가 확인했는지**를 구분해 적는다.

- **실행자 직접 확인** — 지연 청크 `_chapterId-CjuufUDb.js`가 147,935바이트로 존재하고, 메인 엔트리 `index-*.js`에 `diffViewerBackground` 0건(`pnpm build` 후 `grep -l`). 즉 라이브러리 무게가 이 페이지에만 실린다.
- **S1 에이전트 보고 · 실행자 미재현** — `js-yaml`은 diff 계산 코어(`compute-lines.js`) 최상단의 정적 import라 사용 방식과 무관하게 항상 번들에 들어간다는 것. `refractor`의 39개 언어 그래머가 개별 청크로 code-split되고 `language` prop을 안 주면 fetch되지 않는다는 것. gzip 수치(50.82KB)도 여기 속한다. 근거로 인용된 것은 패키지 소스 읽기 + `dist` grep인데, 실행자는 그 grep을 재현하지 않았다 — **확인 필요**. 다만 실질 결론("문법 강조를 안 쓰므로 언어 청크 비용은 0")은 위 지연 청크 크기로 상한이 잡힌다.

## 후속 후보 (이번 범위 밖)

- **같은 코드스플리팅 결함이 기존 3곳에 있다.** 수정자가 조사 중 확인: `read/$chapterId.tsx`의 `ReadPage`, `read/index.tsx`의 `ReadIndexPage`, `synopsis.tsx`의 `SynopsisPage`가 모두 라우트 파일에서 컴포넌트를 export하고 있어 같은 이유로 메인 청크에 인라인될 가능성이 높다. 사전 존재 이슈라 지시대로 손대지 않았다.
- **`tsc -b` 증분 캐시가 한 번 유령 실패를 냈다**(S1). `routeTree.gen.ts`는 실제로 정상이었고 재실행하니 통과했다. 반복되면 캐시를 의심할 것.

## 2/2로 넘어가는 것 (계획이 예고한 대로)

계획이 "1of2 UAT에서 관측해 기록하라"고 지시한 어긋남이 **그대로 열려 있다**: 진입점은 아직 모달이고 페이지는 URL 직접 접근이므로, 집필 화면에 미저장 편집분이 남은 채 페이지에 오면 우측("현재" = 최신 버전)이 실제 원고와 어긋난다. 2/2의 S1(진입 시 선저장 `await`)이 이 창을 닫는다.

---

# 라운드 1 — fg-loop in-place 수정 (2026-08-08)

`<!-- repaired-by: fg-loop -->`. 위 원본 기록은 회고 연료라 지우지 않고 남겼다(fg-run은 "fresh run.md"를 지시하지만, 스파이크·번들 오염·미확인 항목의 정직한 기록을 파기하면 나중 fg-learn이 쓸 재료가 사라진다 — 재실행 가드는 STATUS `verified:`가 담당하므로 이 보존이 가드를 약화시키지 않는다).

## UAT가 잡은 결함 — 좁은 창에서 diff 표가 가로로 넘친다

브라우저 UAT를 실제 주소(`/works/{workId}/versions/{chapterId}`)에서 끝까지 돌려 6개 항목을 봤고, **6번(가로 스크롤 없는 줄바꿈)이 뷰포트 769~1255px 구간에서 깨져 있었다.**

원인: 라이브러리 `diffContainer`가 `min-width: 1000px`을 걸고(`node_modules/react-diff-viewer-continued/lib/cjs/src/styles.js:109`), 이를 푸는 미디어쿼리가 컨테이너가 아니라 **뷰포트** `max-width: 768px`을 본다(같은 파일 135행). 이 페이지의 diff 창 = `뷰포트 − 사이드바 256px`이므로 창이 1000px보다 좁아지는 769~1255px 구간에서 표가 넘친다. 앱의 `styles` 오버라이드는 이 값을 재설정하지 않았다.

**S1 스파이크가 왜 못 봤는가 — 추정이 아니라 스크린샷을 열어 확인했다.** `/tmp/version-diff-spike/02-narrow-1024.png`(1024px 폭, 아직 남아 있다)를 직접 열어 보니 **사이드바가 없고** diff가 화면 전폭을 쓴다(좌 컬럼 ~0–512, 우 ~512–1024). 즉 스파이크의 diff 창은 ~1024px ≥ 1000px이라 `min-width` 바닥에 닿지 않았다. 실화면은 창 = 뷰포트 − 사이드바 256px이라 768px로 떨어져 닿는다. 원본 기록이 "격리 하네스로 대체"라고 정직하게 남긴 바로 그 지점이 결함을 숨겼다. (그 스크린샷은 테마 매핑 전이라 아직 모노스페이스다 — 폰트도 실화면과 달랐다.)

수정: `versions-page.tsx`의 `diffViewerStyles`에 `diffContainer: { minWidth: 0 }` 추가(주석으로 이유 명시). 한 줄.

## 정지조건 검사 — red → green (동일 하네스)

| 검사 | 수정 전 | 수정 후 |
|---|---|---|
| C1 `pnpm typecheck` | pass (무출력) | pass (무출력) |
| C2 `pnpm lint` | pass | pass (`Checked 232 files. No fixes applied.`) |
| C3 `pnpm test` | pass 54 files/379 | pass 54 files/379 (회귀 0) |
| C4 폭 1440·1280·1024·900·768 | **FAIL** — `1024: sw1000>cw768, cell+232` · `900: sw1000>cw644, cell+356` | **PASS** — 5폭 전부 ok |
| C5 상호작용 4종 | pass | pass |
| C6 토큰색·serif | pass | pass |
| C7 콘솔 에러 | pass (0건) | pass (0건) |

C4 계측을 도중에 한 번 교정했다 — 처음엔 텍스트 Range 우단을 봤는데 `pre-wrap`의 줄 끝 공백이 사각형에 포함돼 768px에서 2px 거짓 초과(`txt770` vs 뷰포트 768)가 났다. 창 `scrollWidth > clientWidth`와 **셀 박스가 창 우단을 넘는 양**으로 바꿨고, **교정 후 동일 하네스로 red(`1024: cell+232`)와 green(5폭 ok)을 둘 다 관측했다** — 통과가 계측 완화 때문이 아님은 이 red/green 쌍이 근거다.

C6 실패도 하네스 버그였다: 라이브러리가 어절 diff를 `<ins>`/`<del>`로 렌더하는데(`node_modules/react-diff-viewer-continued/lib/cjs/src/index.js:368,370,451,454` — grep으로 확인) 첫 판 하네스가 `span`만 훑어 `<del>`의 `line-through`를 못 봤다. 선택자에 `ins,del`을 넣자 통과.

**이 검사가 목표와 같은 명제를 보는가** — C4는 실브라우저에서 창의 `scrollWidth/clientWidth`와 셀 박스 좌표를 재므로 "가로 스크롤 없이 좌우가 나란히 읽힌다"를 직접 본다. `styles` 객체에 `minWidth: 0`이 붙었는지 단정하는 식(값 존재 검사)은 의도적으로 쓰지 않았다 — 그건 우선순위·오버라이드로 무력화돼도 통과하는 검사다. **jsdom은 레이아웃 엔진이 없어 이 명제를 원리상 관측할 수 없다**(`web/vitest.config.ts:7` `environment: 'jsdom'` — 직접 확인). 그래서 C3(vitest)이 통과하는 것은 C4에 대해 아무 증거가 아니다.

## 확인한 것 / 남은 한계

- **C4~C7 하네스는 저장소가 아니라 scratchpad에 있다.** playwright를 devDependency로 넣는 것은 #74의 비목표이고 루프의 승인 범위 밖이라 뺐다. **결과적으로 이 결함에는 커밋된 회귀 테스트가 없다** — vitest는 jsdom이라 레이아웃을 못 봐 원리상 이 결함을 잡을 수 없다. 후속 후보로 남긴다.
- 임시 계정·작품을 만들어 검사하고 매 회 삭제했다. **최종 검사 직후 psql로 재확인**: 잔여 임시 계정(`email LIKE 'loopuat%' OR 'uat74%'`) **0건**, 사용자 실데이터 무손상(`gyuha@gyuha.com` 1건 · 실제 화 `4224bd79…`의 버전 2건 · `works` 총 9건 — 착수 시점과 동일).
- 원본 기록이 "확인 필요"로 남긴 S4 항목(배지 색·hover 마커·`변경 없음`)은 이번에 **실제 페이지에서 실증됐다** — C5가 그것이다.

## 후속 후보 (범위 밖)

- **커밋된 브라우저 회귀 테스트가 없다.** 이 결함군(레이아웃·폭)은 jsdom으로 못 잡는다. playwright 도입 여부는 별도 fg-ask 안건.
- 원본 기록의 후속 후보(라우트 파일 export로 인한 코드스플리팅 결함 3곳 — `read/$chapterId.tsx` · `read/index.tsx` · `synopsis.tsx`)는 여전히 열려 있다.
