<!-- forge-slug: web-design-md -->
<!-- task: 24 -->
<!-- tdd: off -->
<!-- retro-hint: optional -->
# web 디자인 시스템 design.md 생성 (DESIGN.md 포맷)

localhost:3000 web 앱의 디자인 시스템을 `web/design.md`로 문서화한다. 포맷은 google-labs-code의 **DESIGN.md 스펙**(YAML front matter 디자인 토큰 + Markdown 본문 근거, 8개 섹션)을 따른다 — AI 코딩 에이전트가 일관된 UI를 생성하도록 하는 기계 판독 디자인 시스템 문서.

소스 오브 트루스는 **`web/src/styles/globals.css`의 디자인 토큰**(렌더링 스크래핑이 아님). localhost:3000 랜딩(`features/landing`)은 Overview의 브랜드 무드 근거로만 쓴다. 기존 디자인을 *기술*할 뿐 변경하지 않는다.

## 목표 / 비목표

- 목표: `web/design.md`를 DESIGN.md 포맷으로 작성한다. YAML front matter에 globals.css 토큰(색 light+dark, 타이포, spacing/layout, radius, shadow, 대표 컴포넌트 매핑)을 정확히 옮기고, 본문에 8개 섹션(Overview·Colors·Typography·Layout·Elevation & Depth·Shapes·Components·Do's and Don'ts)을 채운다. light·dark 팔레트 둘 다 기록한다.
- 비목표:
  - **globals.css·컴포넌트·디자인 자체를 변경하지 않는다** — 기존 시스템을 문서화만 한다(새 토큰/색 추가 없음).
  - design.md를 코드가 소비하도록 배선(빌드/코드젠 파이프라인)하지 않는다 — 문서 산출물만.
  - Storybook·컴포넌트 카탈로그·스크린샷 자산 생성 안 함.
  - 모든 화면 전수 문서화 안 함 — 토큰 시스템 + 대표 컴포넌트(button/input/card/badge 등)로 한정.
  - api/ 백엔드와 무관.

## 진실의 출처

- Glossary terms: 없음 — "design.md/DESIGN.md"는 도메인 용어가 아니라 문서 산출물이라 CONTEXT.md에 넣지 않는다.
- Related ADRs: 없음(되돌리기 쉬운 단일 문서라 ADR 게이트 미충족).
- 포맷 레퍼런스(외부, 본 작업의 형식 출처): **google-labs-code/design.md** — DESIGN.md = "visual identity를 코딩 에이전트에 기술하는 포맷 스펙". 2계층(YAML front matter 토큰 + Markdown 본문 근거), 섹션 순서: Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts. front matter 예: `colors.primary`, `typography.h1.{fontFamily,fontSize}`, `rounded.sm`, `spacing.md`, `components.button-primary.{backgroundColor,textColor}`(토큰 참조 `{colors.primary}`).
- 토큰 출처(앱, 본 작업의 내용 출처): `web/src/styles/globals.css` — Notion 스타일 warm-paper 팔레트. 시맨틱 토큰(shadcn) + StoryWeaver 토큰: `paper #fff·board #e7e5df·surface #f5f5f4·surface-soft #fbfbfa·ink #37352f·ink-soft·muted-ink #787774·faint·line #e9e9e7·line-strong #d8d7d3·ai #9065b0·success #548164·genre #cc782f·danger #d44c47·primary #2383e2` (+ `.dark` 대응값). 폰트: sans=Noto Sans KR, serif=Noto Serif KR, mono. radius: `--radius 0.5rem` → sm/md/lg. shadow: xs/sm/md/lg. tracking: -0.003em. 컴포넌트 패턴(컴포넌트 파일 기준): 버튼 `bg-primary text-white rounded-md h-11`, 입력 `border-line-strong rounded-md h-11`, 카드 `border + shadow-xs/sm` 등.
- Definition of Done: `web/design.md`가 존재하고, (1) YAML front matter의 모든 토큰 값이 globals.css와 일치(색 hex·폰트·radius·shadow), (2) light·dark 둘 다 포함, (3) 본문이 레퍼런스의 8개 섹션을 순서대로 담고, (4) Overview의 무드 기술이 localhost:3000 랜딩 실제 렌더와 부합한다.

## 작업 조각

- [ ] S1. YAML front matter (토큰) — completion criterion: `web/design.md` 상단 `---` 블록에 globals.css 토큰을 옮긴다 — `name`, `colors`(시맨틱+StoryWeaver, **light 기본값 + dark 대응**을 `colorsDark` 또는 색별 light/dark 표기로), `typography`(sans/serif/mono 패밀리 + 컴포넌트 사용값 기반 h1/h2/body/caption 크기·weight·line-height), `spacing`/layout, `rounded`(sm/md/lg = 0.5rem 기준), `elevation`(shadow xs~lg), `components`(button-primary/secondary, input, card, badge 등 실제 스타일을 `{colors.*}`·`{rounded.*}` 참조로 매핑). 모든 값이 globals.css와 일치.
- [ ] S2. Markdown 본문 8 섹션 — completion criterion: front matter 아래에 레퍼런스 순서대로 — **Overview**(warm-paper Notion 무드·브랜드 철학, 랜딩 근거) · **Colors**(각 토큰의 시맨틱 의미·용법) · **Typography**(위계·한글 폰트 규칙) · **Layout**(spacing·그리드) · **Elevation & Depth**(shadow 층위) · **Shapes**(radius 규칙) · **Components**(대표 컴포넌트 토큰 매핑·용법) · **Do's and Don'ts**(사용 가이드). 토큰의 *왜/어떻게*를 담는다.
- [ ] S3. 검증 — completion criterion: front matter 토큰을 globals.css와 1:1 대조(색 hex·폰트·radius·shadow 일치), 8섹션 구조·front matter 형식이 레퍼런스 준수 확인, `task web:dev`(또는 가동 중 서버)로 playwriter를 띄워 localhost:3000 랜딩을 육안 확인해 Overview 무드 기술이 실제와 부합하는지 점검. 불일치는 수정하고 `run.md`에 기록.

(코드 변경이 아니라 문서 산출물이므로 TDD off. `web typecheck/lint` 대상 아님 — Biome는 .md 미검사. 검증은 토큰 대조 + 포맷 준수 + playwriter 육안.)
