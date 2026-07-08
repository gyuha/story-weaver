# run — web 디자인 시스템 design.md 생성

실행 방식: 직접 실행(문서 1개, eco on·tdd off). globals.css 토큰 + google-labs-code/DESIGN.md 포맷 + 컴포넌트/랜딩 패턴이 모두 컨텍스트에 있어 워크플로우 미사용.

## 계획대로 된 것

- **S1 YAML front matter** — `web/design.md` 상단에 globals.css 토큰을 옮김: `colors`(warm-paper 팔레트 light) + `colorsDark`(.dark 대응), `typography`(sans=Noto Sans KR·serif=Noto Serif KR·mono + hero/section/cardTitle/body/label/eyebrow… 스케일), `layout`(4px 스케일·1280px·섹션 패딩), `elevation`(xs~lg), `rounded`(sm/md/lg + card 10·panel 14·full), `components`(button-primary/secondary·input·card·badge-genre·eyebrow·ghost-placeholder, `{token}` 참조).
- **S2 본문 8 섹션** — 레퍼런스 순서대로 Overview·Colors·Typography·Layout·Elevation & Depth·Shapes·Components·Do's and Don'ts. warm-paper "따뜻한 종이 위의 도서관" 무드, 잉크 명도 위계, 세리프=문학 제목/산세리프=UI 규칙, ai=AI 전용 등.
- **검증(S3)** — 토큰 대조: globals.css 핵심 hex(light+dark, `#37352f·#2383e2·#9065b0·#262522·#b18bd0` 등) 전부 design.md에 일치. 포맷: `## ` 8섹션 순서 정확 + YAML front matter. playwriter(localhost:3000): 히어로 serif·본문 sans·장르 nav/배지 확인 → Overview 무드 부합.

## 계획과 어긋난 것 / 현장 결정

1. **[중요] 타깃 경로에 무관한 기존 파일** — `web/design.md`가 이미 **683줄(untracked)** 존재했고 내용이 StoryWeaver가 아니라 **"Meta 디자인 분석"**(Quest/Ray-Ban/cobalt #0064E0/Optimistic VF) — design.md 생성 도구를 meta.com에 돌려본 leftover로 추정. 조직 지침(내가 만들지 않은 파일은 덮기 전 surface)에 따라 **실행을 멈추고 사용자에게 확인**, "덮어쓰기" 승인 후 제거(untracked라 git 복구 불가 고지)하고 StoryWeaver design.md를 새로 작성. (계획엔 없던 발견 — 정상 처리.)
2. **직접 실행**(워크플로우 아님) — 단일 문서라 서브에이전트 불필요.
3. **dark 모드를 `colorsDark` 블록으로** 표현(색별 light/dark 쌍 대신 별도 블록 — DESIGN.md flat-token 포맷에 더 맞음).
4. **radius 스케일 확장** — 테마의 sm/md/lg(4/6/8) 외에 랜딩 카드의 관례값 `card 10px`·`panel 14px`를 토큰으로 추가(코드의 `rounded-[10px]`/`[14px]` 사용을 반영).
5. Overview의 "board 배경 위 paper 카드"에서 board는 `LandingScreen` 래퍼 div의 `bg-board`이고 `<body>` 자체는 흰색 — 기술은 정확(앱 캔버스 = board 래퍼).

## 비목표 준수

- globals.css·컴포넌트·디자인 자체 변경 없음(기술만). design.md를 코드가 소비하는 배선 없음. Storybook/스크린샷 자산 없음. 전 화면 전수 문서화 아님(토큰 + 대표 컴포넌트). api/ 무관.

## 조건부 코드 리뷰 (§3)

순수 문서 산출물(위험 영역 아님) — 별도 적대적 리뷰 페이즈 불필요. 토큰 대조 + 포맷 준수 + playwriter 육안으로 검증.
