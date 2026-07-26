<!-- forge-slug: new-work-creation-wizard -->
<!-- task: 58 -->
# RUN — 새 작품 만들기: 장르 데이터 기반 3-스텝 위저드 페이지로 개편

실행 형태: Claude Code Dynamic Workflow (7 에이전트, 병렬 3 → 통합 1 → 리뷰 1 + 필수수정 1 → 검증 1).
모드: `tdd: on` (슬라이스마다 실패 테스트 선행), `eco: on` (서브에이전트 `sonnet` 캡 + ECO 규율 주입).
도메인 에이전트: 구현·수정 슬라이스는 프로젝트 `.claude/agents/web-feature-builder`로 디스패치, 리뷰·검증은 기본 워크플로우 서브에이전트.
서브에이전트 토큰 672k · 툴 호출 272회 · 소요 약 33분.

## 계획대로 된 것

- **S1 장르 프리셋 데이터** — `features/works/lib/genre-presets.json`에 플랜이 지정한 17개 장르를 순서대로 작성(무협·로맨스 판타지·정통 판타지·현대 판타지·SF·미스터리·판타지·로맨스·현대물·게임/헌터물·아포칼립스·대체역사·라이트노벨·학원/아카데미·스포츠·공포/스릴러·드라마). 장르마다 이모지·세부 키워드 5~7개·기본 문체·문체 3종 예시. `features/works/schema/genre-presets.schema.ts`가 zod로 모듈 로드 시 1회 parse 후 `GENRE_PRESETS`·`GENRES`·`Genre`·`GenrePreset` export. 무협의 문체 예시 3개는 기존 모달 값을 그대로 계승.
- **S2 검색 장르 셀렉트** — `genre-select.tsx`. 기존 `components/ui/popover.tsx` + `command.tsx`(cmdk)만 조립, 신규 의존성 0(`package.json` 무변경). 필터링은 cmdk 기본 필터 사용. 데이터 의존 없는 프레젠테이셔널 컴포넌트(`items`/`value`/`onChange` props)로 만들어 S1과 병렬 실행 가능하게 함.
- **S3 자유 키워드 태그 입력** — `keyword-tag-input.tsx`. Enter/쉼표 커밋(keydown에서 `preventDefault`해 쉼표 문자 유입 차단), trim, `tags`+`reserved` 합집합 대상 대소문자 무시 중복 제거, 칩 `×` 및 빈 입력 Backspace 삭제.
- **S4 위저드 페이지 + 배선 + 리네임** — `new-work-modal.tsx` → `new-work-screen.tsx`(`NewWorkScreen`), 테스트 파일도 `git mv`로 동반 리네임. Step1 장르+프리셋 칩+자유 태그 / Step2 장르별 `styleSamples`·`defaultStyle` / Step3 제목. 장르 전환 시 프리셋 키워드 초기화·자유 태그 유지·문체를 그 장르 기본값으로. 스텝 인디케이터는 완료 스텝(현재보다 작은 스텝)만 클릭 이동. 게이팅: 장르 없으면 "다음" 비활성, 제목 공백이면 "작품 시작" 비활성. `routes/works/new.tsx`에서 `DashboardScreen` 배경과 `NewWorkRoute` 래퍼 제거 → `component: NewWorkScreen` 직결.
- **제출 payload** — `mergeKeywords(presetKeywords, freeTags)`로 병합·대소문자 무시 중복 제거. body 형태 `{ title, genre, keywords, style }` 유지. `created.subGenre`는 서버 응답값을 그대로 사용(클라 계산 없음).
- **기존 회귀 보존** — 성공 시 `addWorkFromServer` → `/works/$workId/write` 이동, 실패 시 `apiErrorMessage` 인라인 에러 + 이동 없음, mutation pending 중 제출 비활성 전부 테스트로 고정.
- **Non-goals 무침범** — `api/` 무변경, `web/src/api/**`·`routeTree.gen.ts` 무변경, 장르/키워드 편집 관리 UI 없음, 정적 `import`(런타임 fetch 없음), i18n 없음, `subGenre` 로직 무변경.
- **최종 검증(오케스트레이터가 직접 재실행)** — `pnpm typecheck` clean · `pnpm lint` clean(218 files) · `pnpm test` **47 files / 235 tests passed**.

## 놓친 것 / 이연한 것

- **S1의 completion criterion에 있던 `pnpm typecheck green`을 병렬 단계에서 실행하지 않고 통합·검증 단계로 이연했다.** 오케스트레이터의 결정으로, 세 에이전트가 동시에 파일을 쓰는 동안 저장소 전체 typecheck/lint를 돌리면 남의 진행 중 편집 때문에 오탐이 나고 그 오탐을 서로 "고치려" 드는 사고가 나기 때문. 최종적으로는 통합 단계와 검증 단계에서 모두 green으로 충족됐다. 슬라이스 시점에는 **각자의 테스트 파일만 scoped 실행**했다.
- **커밋하지 않았다.** 워크플로우 전 단계에 git commit 금지를 걸었으므로 변경은 작업 트리에만 존재한다(`git status`: types.ts·routes/works/new.tsx 수정, new-work-modal→new-work-screen 리네임 2건, 신규 5파일).

## 도중에 내린 결정

- **`Genre` 타입 파생 경로 변경** — `z.record(...)`의 parse 결과에서 `keyof`를 뽑으면 키가 `string`으로 넓혀진다. 그래서 `Genre`는 zod 산출물이 아니라 **원본 JSON import의 `keyof typeof`**에서 파생시켰다. JSON이 단일 출처라는 플랜 의도는 그대로 유지된다.
- **스펙에 없던 추가 export 2개** — `GenrePresetsSchema`, `WRITING_STYLES`. S1의 완성기준 테스트가 "형태가 깨진 항목을 reject"를 검증하려면 스키마 자체에 접근해야 했고, 문체 3종 상수도 테스트·화면 양쪽에서 필요했다.
- **`popover.tsx`의 실제 기반은 radix-ui가 아니라 `@base-ui/react/popover`였다.** 플랜의 전제("기존 popover + command 재사용")는 그대로 성립했고 API(`open`/`onOpenChange`/`align`)가 유사해 조립에 문제 없었다. 플랜 문구의 사실 오류 수준의 사소한 차이.
- **jsdom 폴리필을 테스트 파일 안에 넣었다** — cmdk가 요구하는 `ResizeObserver`/`scrollIntoView`가 jsdom에 없다. `src/test/setup.ts`는 병렬 단계에서 공유 파일이라 손대지 않기로 하고, `genre-select.test.tsx`에 최소 폴리필을 넣었다. S4가 `NewWorkScreen` 안에서 실제 `GenreSelect`를 렌더하게 되자 **같은 폴리필을 `new-work-screen.test.tsx`에도 복제**했다 → 현재 동일 폴리필이 2곳에 중복. `setup.ts`로 승급할 후보.
- **페이지 셸 어휘 선택** — 딤 오버레이(`fixed inset-0`) 대신 `grid min-h-screen place-items-center bg-board`. `bg-board`는 기존 `AuthLayout`의 페이지 캔버스 어휘를 재사용한 것으로, 새 토큰을 만들지 않았다. 카드 마크업(`w-[660px] rounded-xl bg-paper`)은 그대로 계승.
- **`shared/types.ts`의 구 `Genre` 유니온을 삭제했다** — `Work.genre`를 `string`으로 완화한 뒤 참조가 0인지 grep으로 확인하고 제거. 우리 변경이 만든 orphan 정리(플랜에 명시는 없었으나 단일 출처 원칙과 일치). `subGenre`·`GenreBadge`·`GenreSection` 등 동명이인 식별자는 건드리지 않았다.
- **플랜에 없던 소폭 보강 2건** — ① 동일 장르 재선택 가드(아래 리뷰 항목), ② Escape 키 닫기 유지(기존 모달 동작 계승, 페이지에서도 취소 UX로 자연스럽다). 둘 다 Non-goals와 무관.
- **초기 장르를 `null`로 두었다** — 기존 모달은 `'무협'`이 기본 선택이었다. 플랜의 "장르 없으면 다음 불가" 게이팅이 실제로 의미를 갖도록 미선택 상태에서 출발하게 바꿨다.

## 리뷰에서 잡은 결함 (조건부 코드리뷰 — 작품 생성 mutation 경로 = 위험 영역)

- **major / mustFix 1건, in-run 수정 완료** — `new-work-screen.tsx`의 `selectGenre`가 "같은 장르 재선택"을 별개 이벤트로 취급하지 않아, 콤보박스를 다시 열어 이미 선택된 장르를 재클릭하는 것만으로 사용자가 고른 프리셋 키워드와 step2에서 직접 바꾼 문체가 **조용히 초기화**됐다. 재현 시나리오: 무협 선택 → 프리셋 '성장' 토글 → step2에서 문체를 서정체로 변경 → step1로 되돌아가 '무협' 재클릭 → 키워드·문체 유실 → 그대로 제출하면 사용자 의도와 다른 payload가 서버로 간다. 리뷰어가 실제 렌더링으로 재현 확인.
  - 수정: `selectGenre` 시작부에 `if (nextGenre === genre) return;` 가드 + 그 시나리오를 재현하는 테스트 1건 추가(수정 전 FAIL → 수정 후 PASS 확인). 다른 장르로 전환할 때의 초기화 동작은 그대로.
- **잔여 critical 없음.** 제출 payload 병합·중복제거, 성공/실패 경로, 리네임 완결성(`new-work-modal`/`NewWorkModal` 잔존 참조 0), JSON 단일 출처 무결성(17개 전수, `defaultStyle` ⊂ `styleSamples`), 접근성 기본(삭제·닫기 버튼 라벨)은 전부 정상 판정.

## 막혔던 곳 / 환경 이슈

- **playwriter MCP가 이 환경에 등록되어 있지 않다.** `CLAUDE.md`는 UI 육안 확인에 playwriter MCP를 쓰라고 지시하지만 도구가 없었다. S4가 대신 gstack `browse` 스킬로 dev 서버(`:3000`) + 실 백엔드(`:8000`)를 띄워 라이브 QA를 수행했다: 오버레이·대시보드 배경 부재, 스텝 인디케이터 게이팅, 장르 전환 시 프리셋 초기화·자유 태그 유지, 장르별 기본 문체 적용, 그리고 **실제 `POST /works`가 병합·중복제거된 keywords로 성공하고 write 화면으로 이동**하는 것까지 확인(정통 판타지에서 프리셋 '던전 공략' + 자유 태그 '차원이동자' → 로맨스 판타지로 전환 후 제출 → 서버 keywords `['차원이동자']`, style `'서정체'`).
  - **부수효과 기록** — 그 과정에서 dev 백엔드에 **일회용 테스트 계정 1개와 그 계정이 만든 작품 데이터가 남아 있을 가능성이 있다**(가입 후 Mailpit API로 이메일 검증까지 진행). 로컬 dev DB 한정이지만 정리 대상이다.
- **라이브 QA 중 무관한 기존 경고 1건 발견** — Base UI `nativeButton` 경고가 `LandingScreen`의 Button/user-menu/top-bar 경로에서 발생. 이번 작업 범위가 아니라 손대지 않았다. 후속 작업 후보.

---

# 재실행 #2 — UAT 실패 후 수정 (한글 IME 조합)

워크플로우 종료 직후 `verified: yes`로 기록했으나, 사용자가 브라우저에서 **한글 IME 결함**을 발견해 `verified: failed`로 정정했다. 아래는 그 수정 기록. 워크플로우를 다시 돌리지 않고 **직접 실행**했다(변경 규모가 가드 2줄 + 회귀 테스트 3건이라 워크플로우가 더 비싸다).

## 결함

자유 키워드 입력에서 한글을 입력하고 Enter를 누르면 **태그가 2개로 쪼개졌다**: `먼치킨` → `먼치킨` + `킨`, `혼자` → `혼자` + `자`. 마지막 음절이 두 번째 태그로 새어 나온다.

원인: `onKeyDown`이 **IME 조합 중의 Enter**를 일반 Enter로 취급했다. 조합 중 Enter는 조합 확정용인데, 그 시점에 `commit()`이 먼저 돌아 확정 전 값(`먼치킨`)을 태그로 만들고 입력창을 비운다. 이어서 조합이 확정되며 남은 음절(`킨`)이 입력창에 다시 들어가고 그것이 두 번째 태그가 된다.

## 왜 테스트 22건이 이걸 통과시켰나 (핵심 교훈)

**RTL `userEvent.type`은 IME composition을 시뮬레이션하지 않는다.** `compositionstart`/`compositionend`도, `KeyboardEvent.isComposing`도 발생시키지 않으므로 조합 관련 결함은 테스트 스위트에 **원리적으로 보이지 않는다**. 그래서 슬라이스 테스트 22건·전체 235건이 전부 green이면서도 한국어 사용자에겐 첫 입력부터 깨지는 상태였다. 워크플로우의 라이브 QA(`browse`)도 놓쳤다 — 자동 입력은 IME를 거치지 않기 때문.

→ **한국어 제품에서 Enter로 커밋하는 입력은 `isComposing` 가드가 기본값이어야 하고, 그 검증은 실제 한글 입력(사람 또는 IME를 태우는 도구) 없이는 성립하지 않는다.** `verified: yes`를 테스트 green만으로 기록한 것이 오판이었다.

## 수정

- `keyword-tag-input.tsx` — `onKeyDown` 진입부에 `if (e.nativeEvent.isComposing) return;`. Enter·쉼표뿐 아니라 **Backspace도 함께 막는다**(조합 중 Backspace는 자모 삭제이므로 태그를 지우면 안 된다).
- `new-work-screen.tsx:241` — 제목 입력의 Enter 제출에 같은 가드(`&& !e.nativeEvent.isComposing`). 이건 사용자가 신고한 항목은 아니지만 **동일 결함에 결과가 더 나쁘다**: 조합 확정 Enter가 그대로 `POST /works`를 쏴서 작품이 조기 생성된다. 기존 모달에서 그대로 계승된 코드였다.
- 회귀 테스트 3건 추가 — 조합 중 Enter 미커밋 + 조합 후 Enter 1회만 커밋 / 조합 중 Backspace가 태그 미삭제 / 제목 조합 Enter 미제출. `fireEvent.keyDown(input, { key: 'Enter', isComposing: true })`로 조합 플래그를 직접 넣는다(jsdom이 실제 조합 버퍼를 재현하지 못하므로 근본 원인인 가드를 고정하는 방식).
- **테스트 유효성 확인** — 가드를 일시 제거하고 돌려 3건이 정확히 실패(`3 failed | 13 passed`)하는 것을 확인한 뒤 복원했다. 가드 유무와 무관하게 통과하는 무의미한 테스트가 아니다.

## 재검증

`pnpm typecheck` clean · `pnpm lint` clean(218 files) · `pnpm test` **47 files / 238 tests passed**(기존 235 + 신규 3).

**단, 실제 IME 동작은 브라우저에서 한글을 직접 입력해야만 확인된다** — jsdom도, 자동화 입력도 조합을 태우지 못한다. 최종 확인은 사용자 육안 재검증에 달려 있다.

## 같은 결함이 남아 있는 곳 (이번 범위 밖 · 기존 코드)

`isComposing` 가드 없이 Enter를 처리하는 핸들러가 4곳 더 있다. 전부 이번 작업이 만든 것이 아니라 기존 코드이므로 손대지 않았다:

- `features/memory/components/memory-panel.tsx:648` — `Enter && !shiftKey`로 채팅 전송. **가장 영향이 크다** — 한글 메시지가 조합 확정 Enter에서 조기 전송될 수 있다(매일 쓰는 경로).
- `features/works/components/synopsis-editor.tsx:97` — Enter → `blur()`로 제목 확정.
- `features/editor/components/manuscript.tsx:232` — Enter → `blur()`로 화 제목 확정.
- `components/layout/work-tree.tsx:418` — Enter → 이름변경 확정.

## 후속 작업 후보 (다음 fg-ask)

- **한글 IME Enter 가드 전수 적용** — 위 4곳. 특히 `memory-panel` 채팅 전송. 가능하면 `onCommitKeyDown` 같은 공용 헬퍼 하나로 묶어 재발 차단.
- jsdom cmdk 폴리필(`ResizeObserver`/`scrollIntoView`)을 `src/test/setup.ts`로 승급해 2곳 중복 제거.
- Base UI `nativeButton` 경고 정리(`LandingScreen` 계열).
- dev 백엔드에 남은 일회용 QA 계정·작품 데이터 정리.
- 장르 프리셋 키워드·문체 예시 초안의 문안 검수(현재는 이번 작업에서 작성한 초안).
