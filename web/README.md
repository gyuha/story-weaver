# StoryWeaver Web

AI 웹소설 창작 SaaS "StoryWeaver"의 프론트엔드 (React 19 + Vite + TanStack Router). 설계 문서는 저장소 루트의 `docs/` 참조.

## 스택

- React 19, TypeScript 5.8
- Vite 6 + `@tanstack/router-plugin/vite` (file-based routing)
- Tailwind CSS v4 (`@tailwindcss/vite`) + tw-animate-css
- shadcn/ui (`base-nova`, `neutral`, `lucide`)
- TanStack Query 5, Zustand 5
- react-hook-form 7 + Zod 3
- sonner (토스트), 자체 모달 매니저
- pnpm 10 (npm 사용 금지)

## 시작하기

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # 타입체크 + 프로덕션 빌드
pnpm preview      # 빌드 산출물 미리보기
pnpm typecheck    # 타입체크 단독
pnpm lint         # Biome
pnpm lint:fix     # Biome 자동 수정 적용
pnpm format       # 포맷팅만 적용
```

## 디렉토리

- `src/routes/` — file-based 라우트 (자동 생성된 `routeTree.gen.ts` 와 공존)
- `src/features/` — 도메인 단위 기능 (auth 등)
- `src/components/ui/` — shadcn 컴포넌트 + 자체 모달
- `src/stores/` — 전역 Zustand 스토어
- `src/lib/` — 유틸/라우터 인스턴스

## 라우트

- `/` — 홈, 인증 상태 표시
- `/auth/login`, `/auth/signup` — 폼 (mock API)
- `/test/modal` — 모달 매니저 데모
