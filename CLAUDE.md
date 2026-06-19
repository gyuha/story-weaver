# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

StoryWeaver — AI가 작가의 세계관·캐릭터·설정을 기억하고 집필을 보조하는 웹소설 창작 SaaS.

## 저장소 구성 (monorepo)

- `api/` — FastAPI 백엔드. **자체 `api/CLAUDE.md`가 있으니 백엔드 작업 시 먼저 읽을 것.**
- `web/` — React 프론트엔드 (이 파일이 주로 다루는 영역).
- `docs/` — 제품 설계 문서 (PRD·architecture·data-model·ai-pipeline·image-generation·roadmap). 기능을 만들기 전 해당 문서 확인.
- `.forge/` — 도메인 용어집(`CONTEXT.md`)과 결정 기록(`adr/`). **사용자 대면 용어는 여기 글로서리를 따른다** (아래 참조).

## 도메인 언어 (사용자 대면 UI·코드 네이밍에서 준수)

`.forge/CONTEXT.md`가 단일 출처. 핵심:

- **작품 (Work)** — 한 작가의 소설 프로젝트, 최상위 소유 단위. ("프로젝트/책" 금지)
- **World Bible** — 한 작품의 모든 설정 저장소. "기억하는 AI"의 근거 데이터.
- **엔티티 카드 (Entity Card)** — World Bible 안의 한 항목(인물·장소·사건·아이템).
- **씬 (Scene)** — 집필·AI 생성의 최소 단위. 계층: `작품 → 에피소드 → 챕터 → 씬`.
- **메모리 (Memory)** — 집필 중 씬과 관련된 설정을 AI 컨텍스트로 제공하는 작업. 사용자 대면 문구에서 "RAG" 대신 "메모리"를 쓴다.
- **품질 티어 (Quality Tier)** — 사용자가 작품에 적용하는 생성 품질(저비용/균형/고품질). 사용자는 모델명·API 키를 직접 다루지 않는다(BYOK 아님).

## web — 명령어

패키지 매니저는 **pnpm** (Node ≥ 22.18). `cd web` 후 실행:

```bash
pnpm dev        # Vite 개발 서버 (포트 3000)
pnpm build      # tsc -b && vite build
pnpm typecheck  # tsc --noEmit
pnpm lint       # biome check .
pnpm lint:fix   # biome check --write .
pnpm generate   # openapi-ts: docs/openapi.json → src/api 타입·SDK 재생성
```

테스트 러너는 아직 없다(web에 vitest/jest 미설정). 검증은 `pnpm typecheck` + `pnpm lint`로 한다.

**화면 확인** — UI 변경의 실제 렌더링·동작을 눈으로 확인해야 할 때는 **playwriter MCP**(`mcp__playwriter_latest__execute`)로 브라우저를 띄워 `http://localhost:3000`을 확인한다. "버튼이 보이는지", "네비게이션이 동작하는지" 등 정적 분석으로 단정할 수 없는 것은 추측하지 말고 playwriter로 직접 확인할 것.

## web — 아키텍처

React 19 + Vite 6 + TypeScript(strict). 상태/데이터는 **TanStack Query**(서버), **Zustand + immer**(클라이언트), 라우팅은 **TanStack Router**(파일 기반), 스타일은 **Tailwind v4**, 린트·포맷은 **Biome**.

**기능 단위 구조** — `src/features/<도메인>/` 아래 `components / store / types / schema / lib / mock`으로 자기 완결. 도메인: `auth · works · world-bible · editor · timeline · memory · settings · shared`. 도메인 공유 코드는 `features/shared/`.

**라우팅** — `src/routes/`의 파일 기반 라우트를 `@tanstack/router-plugin`이 빌드 시 `src/routeTree.gen.ts`로 자동 생성(autoCodeSplitting). **`routeTree.gen.ts`는 수정 금지(생성물).** 라우트 추가는 `src/routes/`에 파일을 만들면 된다. 인증 게이트는 `src/routes/index.tsx`가 `useAuthStore`로 판단해 `/works` 또는 `/auth/login`으로 redirect.

**API 레이어** — 백엔드 호출은 `pnpm generate`로 `docs/openapi.json`에서 생성한 `src/api/`의 타입·SDK·TanStack Query 훅을 쓴다. **`src/api/`는 생성물이라 직접 편집 금지**이며 tsc/biome 모두 제외 대상. 클라이언트 설정은 `src/lib/api-client.ts`(baseURL = `VITE_API_BASE_URL` 또는 `/api`), 인터셉터는 `src/lib/api-interceptors.ts`.

**현재 상태** — UI 우선 단계로, 대부분의 화면이 `features/*/mock/`의 시드 데이터를 Zustand 스토어에 채워 동작한다(예: `features/shared/store/works.store.ts`). 실 API 클라이언트는 배선돼 있으나 기능 연결은 진행 중. 새 화면은 이 mock-store 패턴을 따르되, 실 API 전환 시 생성된 Query 훅으로 교체.

**경로 별칭** — `@/*` → `web/src/*`.

### web 규칙

- 커밋 전 `pnpm typecheck`와 `pnpm lint` 통과가 기본. Biome 설정: 들여쓰기 2칸, 작은따옴표, 줄 폭 100, ES5 trailing comma.
- 생성 파일(`src/routeTree.gen.ts`, `src/api/**`)은 손대지 않는다.
- 새 라우트는 `to`/`params` 타입이 컴파일 타임에 검증된다(`tsc --noEmit`로 유효성 확인).

## 백엔드 연동 (로컬)

web의 Vite 프록시는 `/api` → `http://localhost:8080`으로 보낸다(`web/vite.config.ts`). **주의:** `api/README.md`의 dev 서버 기본 포트는 `:8000`이라 불일치가 있다 — 로컬 풀스택 구동 시 프록시 타깃과 실제 API 포트를 일치시킬 것. 백엔드 구동·구조는 `api/CLAUDE.md` 참조.
