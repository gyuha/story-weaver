---
name: StoryWeaver
description: >-
  StoryWeaver는 AI가 작가의 세계관·캐릭터·설정을 기억하고 집필을 보조하는 웹소설 창작 SaaS다.
  디자인은 Notion 스타일의 따뜻한 종이(warm-paper) 캔버스를 기반으로 한다 — board(연한 모래색)
  배경 위에 paper(흰색) 카드를 얹고, UI·본문은 Noto Sans KR로, 작품 제목·문학적 표현은 Noto
  Serif KR로 짠다. 차분한 잉크 그레이 텍스트 위계(ink → ink-soft → muted-ink → faint →
  faintest)와 얇은 hairline, 절제된 그림자로 정보 밀도를 높이고, 강조는 primary(코발트 블루),
  ai(보라), success/genre/danger 같은 시맨틱 액센트로만 준다. light·dark 두 테마를 모두 지원한다.
  토큰의 단일 출처는 web/src/styles/globals.css이며 이 문서는 그것을 기술한다.

# ── Colors (light 기본) ───────────────────────────────────────────────────────
colors:
  # 표면 (warm-paper)
  paper: "#ffffff"          # 카드·패널 표면
  board: "#e7e5df"          # 앱 바깥 배경 (paper 카드를 띄우는 모래색 보드)
  surface: "#f5f5f4"        # 한 단계 들어간 표면 (입력 트랙·고스트 슬롯)
  surface-soft: "#fbfbfa"   # 아주 옅은 표면 (그라데이션 상단 등)
  # 텍스트 (잉크 그레이 위계)
  ink: "#37352f"            # 본문·제목 기본
  ink-soft: "#5f5e5b"       # 부제·설명
  muted-ink: "#787774"      # 보조 텍스트
  faint: "#9b9a97"          # 캡션·메타
  faintest: "#b9b8b3"       # 자리표시 아이콘 등 최약
  # 선
  line: "#e9e9e7"           # 기본 hairline
  line-strong: "#d8d7d3"    # 입력 테두리 등 강한 선
  # 액센트 (시맨틱)
  primary: "#2383e2"        # 주요 액션·링크 (코발트 블루)
  on-primary: "#ffffff"
  ai: "#9065b0"             # AI 기능 (메모리·생성) 전용 보라
  ai-soft: "#f6f3f9"        # ai 배경 톤
  success: "#548164"        # 성공·에디터픽
  genre: "#cc782f"          # 별점·장르 강조(주황)
  danger: "#d44c47"         # 경고·삭제·HOT
  danger-soft: "#fdebec"    # danger 배경 톤

# dark 테마 대응값 (.dark) — 토큰명은 light와 동일
colorsDark:
  paper: "#262522"
  board: "#1a1917"
  surface: "#1f1e1c"
  surface-soft: "#232220"
  ink: "#e9e7e2"
  ink-soft: "#c9c6bf"
  muted-ink: "#a8a59e"
  faint: "#837f78"
  faintest: "#635f59"
  line: "#38362f"
  line-strong: "#45433c"
  primary: "#4a9eea"
  on-primary: "#ffffff"
  ai: "#b18bd0"
  ai-soft: "#2c2733"
  success: "#7aa888"
  genre: "#d99a5c"
  danger: "#e06b66"
  danger-soft: "#3a2725"

# ── Typography ────────────────────────────────────────────────────────────────
typography:
  fontFamily:
    sans: "Noto Sans KR, ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"  # UI·본문
    serif: "Noto Serif KR, Georgia, Times New Roman, serif"                                       # 작품 제목·문학적 표현
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  tracking: "-0.003em"   # 본문 기본 자간 (body letter-spacing)
  scale:
    hero:      { family: serif, fontSize: "46px",   fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.02em" }  # 히어로 작품 제목
    display:   { family: serif, fontSize: "32px",   fontWeight: 900, lineHeight: 1.25, letterSpacing: "-0.01em" }  # CTA 배너
    pageTitle: { family: sans,  fontSize: "26px",   fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em" }  # auth 등 화면 제목
    section:   { family: serif, fontSize: "25px",   fontWeight: 700, lineHeight: 1.2,  letterSpacing: "-0.01em" }  # 섹션 제목
    cardTitle: { family: serif, fontSize: "15px",   fontWeight: 700, lineHeight: 1.35 }                            # 작품 카드 제목
    body:      { family: sans,  fontSize: "16px",   fontWeight: 400, lineHeight: 1.7 }
    bodySmall: { family: sans,  fontSize: "13.5px", fontWeight: 400, lineHeight: 1.6 }
    label:     { family: sans,  fontSize: "12.5px", fontWeight: 500, lineHeight: 1.4 }                             # 폼 라벨
    eyebrow:   { family: sans,  fontSize: "12px",   fontWeight: 600, textTransform: uppercase, letterSpacing: "0.06em" }  # 섹션 윗머리
    caption:   { family: sans,  fontSize: "11.5px", fontWeight: 400, lineHeight: 1.0 }                             # 메타·캡션

# ── Layout ────────────────────────────────────────────────────────────────────
layout:
  spacingBase: "4px"            # Tailwind 4px 스케일 (gap-2=8px, gap-8=32px …)
  contentMaxWidth: "1280px"     # 중앙 콘텐츠 폭
  gutterMobile: "20px"          # 모바일 좌우 여백 (px-5)
  sectionPaddingMobile: "32px"  # 섹션 패딩 (p-8)
  sectionPaddingDesktop: "42px 50px 40px"

# ── Elevation & Depth ─────────────────────────────────────────────────────────
elevation:
  xs: "0 1px 2px rgba(15,15,15,0.04)"
  sm: "rgba(15,15,15,0.05) 0 0 0 1px, rgba(15,15,15,0.07) 0 2px 4px"
  md: "rgba(15,15,15,0.05) 0 0 0 1px, rgba(15,15,15,0.1) 0 3px 8px"
  lg: "rgba(15,15,15,0.05) 0 0 0 1px, rgba(15,15,15,0.12) 0 8px 28px"

# ── Shapes (border radius) ──────────────────────────────────────────────────
rounded:
  sm: "4px"      # calc(--radius - 4px) — 배지
  md: "6px"      # calc(--radius - 2px) — 버튼·입력
  lg: "8px"      # --radius 0.5rem
  card: "10px"   # 콘텐츠 카드 (관례값)
  panel: "14px"  # CTA·대형 패널 (관례값)
  full: "9999px" # 아바타·pill

# ── Components ──────────────────────────────────────────────────────────────
components:
  button-primary:    { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.md}", height: "44px", fontWeight: 600 }
  button-secondary:  { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.md}", height: "44px", fontWeight: 600 }
  input:             { backgroundColor: "{colors.paper}", borderColor: "{colors.line-strong}", textColor: "{colors.ink}", rounded: "{rounded.md}", height: "44px", focusRing: "{colors.primary}" }
  card:              { backgroundColor: "{colors.paper}", borderColor: "rgba(55,53,47,0.09)", rounded: "{rounded.card}", shadow: "{elevation.xs}" }
  badge-genre:       { rounded: "{rounded.sm}", paddingX: "6px", paddingY: "4px", fontSize: "11px", fontWeight: 600 }  # 장르별 파스텔 톤
  eyebrow:           { textColor: "{colors.faint}", fontSize: "12px", textTransform: uppercase, letterSpacing: "0.06em" }
  ghost-placeholder: { backgroundColor: "{colors.surface}", borderColor: "{colors.line}", iconColor: "{colors.faintest}" }  # 표지·아바타 자리표시
---

## Overview

StoryWeaver의 비주얼은 **"따뜻한 종이 위의 도서관"** 이다. 바깥은 `board`(연한 모래색)로 칠하고 그 위에 `paper`(흰색) 카드를 띄워, Notion 같은 정돈된 정보 표면을 만든다. 텍스트는 순수 검정 대신 따뜻한 잉크 그레이(`ink #37352f`)를 기본으로 쓰고, 위계는 색이 아니라 **명도 단계**(ink → ink-soft → muted-ink → faint → faintest)로 표현한다.

두 글꼴이 역할을 나눈다. **Noto Sans KR**(`sans`)는 UI·본문·메타데이터를 담당하고, **Noto Serif KR**(`serif`)는 작품 제목·히어로·에디터픽처럼 *문학적 정체성*을 드러내야 하는 곳에만 쓴다 — 웹소설 플랫폼답게 "읽을거리"의 무게를 세리프로 전한다.

강조는 아낀다. 면을 채우는 색은 거의 없고, `primary`(코발트 블루)는 주요 액션·링크에, `ai`(보라)는 AI 기능(메모리·생성)에만, `success`/`genre`/`danger`는 각자의 시맨틱에만 등장한다. 장르 배지만 예외적으로 파스텔 톤을 일회성 장식으로 쓴다. 그림자는 `xs`~`lg`로 절제하고, 대부분의 분리는 `line` hairline으로 처리한다. light·dark 두 테마가 같은 토큰 이름으로 동작한다.

## Colors

색은 **표면 / 텍스트 / 선 / 액센트** 네 묶음이다.

- **표면**: `board`(앱 배경) → `paper`(카드) → `surface`(한 단계 들어간 트랙·고스트) → `surface-soft`(가장 옅은 톤). 깊이는 색이 아니라 이 표면 층 + 그림자로 만든다.
- **텍스트**: `ink`(본문/제목) · `ink-soft`(부제/설명) · `muted-ink`(보조) · `faint`(캡션/메타) · `faintest`(자리표시). 색상 대비가 아니라 명도로 위계를 준다.
- **선**: `line`(기본 hairline, 카드·구분선) · `line-strong`(입력 테두리 등 또렷한 선).
- **액센트(시맨틱, 면 채움 최소)**: `primary`=주요 액션·링크, `ai`=AI 기능 전용(보라; 일반 액션에 쓰지 말 것), `success`=성공/에디터픽, `genre`=별점·장르 강조, `danger`=경고/삭제/HOT. 각 액센트는 옅은 배경 짝(`ai-soft`, `danger-soft`)을 가진다.

dark 테마는 `colorsDark`의 대응값으로 동일 토큰을 재정의한다(`paper`가 어두운 종이색이 되는 식). 컴포넌트는 토큰 이름만 참조하고 hex를 직접 박지 않는다.

## Typography

위계는 `typography.scale`로 고정한다.

- **세리프(Noto Serif KR)** — `hero`(46px/900), `display`(CTA 32px/900), `section`(섹션 제목 25px/700), `cardTitle`(작품 카드 15px/700). "작품/이야기"의 얼굴.
- **산세리프(Noto Sans KR)** — `pageTitle`(화면 제목 26px/700), `body`(16px/1.7), `bodySmall`(13.5px), `label`(폼 라벨 12.5px), `eyebrow`(섹션 윗머리 12px, **대문자+0.06em 자간**), `caption`(11.5px). UI·본문·메타.

규칙: 한글 가독성을 위해 본문 line-height는 넉넉히(1.6~1.7), 큰 제목은 자간을 음수로(`-0.01~-0.02em`) 좁힌다. 본문 기본 자간은 `-0.003em`. 세리프는 *제목/문학적 맥락에만* — 버튼·라벨·메타에 세리프를 쓰지 않는다.

## Layout

4px 스케일(Tailwind) 위에서 움직인다. 콘텐츠는 `contentMaxWidth 1280px`로 중앙 정렬하고, 모바일은 좌우 `20px`(px-5) 여백을 둔다. 섹션 패딩은 모바일 `32px`(p-8), 데스크톱 `42px 50px 40px` 수준. 큰 화면에서는 카드 묶음 사이를 `30px` 안팎으로 띄운다. 카드 내부 구분은 좌우 여백을 준 hairline(`mx-[50px] h-px bg-ink/[0.08]`)으로 섹션을 나눈다.

## Elevation & Depth

깊이는 4단계 그림자로만 준다 — `xs`(카드 기본, 거의 평평) · `sm` · `md`(hover 부상) · `lg`(팝오버·드롭다운·모달). 모든 그림자는 `0 0 0 1px`의 옅은 테두리 레이어를 함께 깔아 경계를 또렷이 한다. 표면 층(`board`→`paper`→`surface`)과 hairline이 1차 분리 수단이고, 그림자는 *떠 있음*을 표현할 때만 추가한다. 과한 그림자는 warm-paper의 차분함을 깨므로 피한다.

## Shapes

라운드는 `--radius 0.5rem`(8px) 기준의 sm(4)/md(6)/lg(8) 스케일에, 콘텐츠 카드용 `card`(10px)·대형 패널용 `panel`(14px)·아바타/pill용 `full`을 더해 쓴다. 버튼·입력은 `md`, 배지는 `sm`, 작품/정보 카드는 `card`, CTA 같은 큰 면은 `panel`, 작가 아바타·원형 토큰은 `full`.

## Components

- **button-primary** — `primary` 배경 + 흰 글자, `rounded.md`, 높이 40~44px, `font-semibold`. 화면당 주요 액션 하나에.
- **button-secondary** — `surface` 배경 + `ink` 글자, 같은 모양. 보조 액션. (어두운 면 위에서는 `bg-white/12 + border-white/30` 변형을 쓴다.)
- **input** — `paper` 배경 + `line-strong` 테두리, `rounded.md`, 높이 44px, 포커스 시 `primary` 링(`shadow 0 0 0 3px rgba(35,131,226,0.22)`). 라벨은 `label` 타입.
- **card** — `paper` 배경 + 옅은 테두리(`rgba(55,53,47,0.09)` 또는 `line`) + `rounded.card` + `elevation.xs`. hover 시 `md`로 부상.
- **badge-genre** — `rounded.sm`, 작은 패딩, 11px/600. 장르별 파스텔 톤(무협=세피아, 로판=핑크, 현판=블루, 판타지=ai-soft)을 *장식용 일회성*으로 허용. 그 외 배지는 `surface`+`muted-ink` 중립.
- **eyebrow** — 섹션 제목 윗머리. `faint` 색, 대문자, `0.06em` 자간.
- **ghost-placeholder** — 표지·아바타의 이미지 연동 전 자리표시. `surface` 배경 + `line` 테두리 + `faintest` 아이콘.

## Do's and Don'ts

- ✅ 텍스트 위계는 잉크 명도 단계(ink→faint)로 표현한다. ❌ 위계를 위해 임의 색을 끌어오지 않는다.
- ✅ 세리프(Noto Serif KR)는 작품 제목·히어로 등 문학적 맥락에만. ❌ 버튼·라벨·메타에 세리프 금지.
- ✅ `ai`(보라)는 AI 기능 전용. ❌ 일반 액션 강조에 `ai`를 쓰지 않는다(혼동 유발).
- ✅ 분리는 표면 층 + hairline 우선, 그림자는 *떠 있는* 요소에만. ❌ 카드마다 짙은 그림자를 남발하지 않는다.
- ✅ 색은 토큰 이름으로 참조해 light/dark가 함께 동작하게 한다. ❌ 컴포넌트에 hex를 직접 박지 않는다(장르 배지의 일회성 장식 톤은 예외).
- ✅ 면 채움 색은 액센트(primary/danger/success)에 한해 최소로. ❌ warm-paper 캔버스를 채도 높은 배경으로 덮지 않는다.
