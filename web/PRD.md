# Auth Sample Bootstrap Implementation Plan

> **⚠️ Historical document.** Original PRD from the initial Next.js scaffold (2026-04-26).
> The stack has since migrated to **React + Vite + TanStack Router** on 2026-05-09.
> Current architecture: see `README.md` and `docs/superpowers/plans/2026-05-10-vite-migration.md`.
> Below content is preserved verbatim for reference but does NOT describe the current code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js App Router 기반의 프론트엔드 부트스트랩 프로젝트를 구성하고, 회원가입/로그인 샘플 페이지를 프론트 단독(mock 기반)으로 구현한다.

**Architecture:** `src/app` 중심의 App Router 구조를 사용하고, 인증 기능은 `src/features/auth` 아래에 feature 단위로 분리한다. UI는 shadcn/ui와 Tailwind CSS를 기반으로 하고, 폼 상태와 검증은 React Hook Form + Zod, 인증 UI 상태는 Zustand, 비동기 제출 흐름은 TanStack Query mutation으로 구성한다.

**Tech Stack:** Next.js (App Router), TypeScript, React 19, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, React Hook Form, Zod, Motion, pnpm, Biome

---

## 1. 제품 개요

본 프로젝트는 Next.js 프론트엔드 시작 템플릿을 구축하는 것이 목적이다.
1차 범위에서는 실제 백엔드나 DB 없이도 동작 흐름을 확인할 수 있도록 회원가입/로그인 샘플 페이지를 구현한다.

핵심 목표는 다음과 같다.

- Next.js App Router 기반 초기 프로젝트 구조 확립
- 디자인 시스템 기초 구성
- 인증 관련 샘플 UI/UX 구현
- 타입 안정성과 폼 검증 체계 확보
- 이후 실제 API/인증 시스템으로 확장 가능한 구조 마련

## 2. 범위

### 포함 범위

- Next.js 프로젝트 초기 세팅
- Tailwind CSS, shadcn/ui, Biome, pnpm 기반 개발 환경 구성
- 회원가입 페이지
- 로그인 페이지
- 공통 인증 레이아웃
- Zod 기반 입력 검증
- mock API 기반 제출 성공/실패 흐름
- Zustand 기반 클라이언트 인증 상태 예시
- TanStack Query mutation 기반 요청 상태 처리
- Motion 기반 최소한의 인터랙션

### 제외 범위

- 실제 DB 연동
- 실제 이메일 인증
- OAuth, 소셜 로그인
- 서버 세션, JWT, 쿠키 인증
- 비밀번호 찾기, 프로필, 권한 관리

## 3. 기술 스택 적용 원칙

### Next.js (App Router)

- 페이지 라우팅과 레이아웃 구성을 담당한다.
- 인증 화면은 route group을 사용해 `/login`, `/signup`을 관리한다.

### TypeScript

- 폼 입력 타입, mock 응답 타입, 상태 타입을 명시한다.
- `any` 없이 feature 경계를 명확히 유지한다.

### Tailwind CSS + shadcn/ui

- 기본 UI 컴포넌트와 레이아웃 스타일을 담당한다.
- 직접 만드는 UI보다 shadcn/ui 기본 컴포넌트를 우선 사용한다.

### Zustand

- 로그인 여부, 사용자 표시 이름 등 최소 인증 상태만 관리한다.
- 폼 상태 자체는 React Hook Form에서 관리하고 Zustand로 중복 관리하지 않는다.

### TanStack Query

- 실제 API 대신 mock async 함수 호출을 `useMutation`으로 감싼다.
- `Query`는 1차 범위에서 사용하지 않아도 된다.

### React Hook Form + Zod

- 회원가입/로그인 폼 상태와 검증의 표준 조합으로 사용한다.
- 스키마를 기준으로 타입을 추론한다.

### Motion

- 화면 전환이나 제출 완료/오류 메시지 노출에만 제한적으로 사용한다.

### pnpm + Biome

- 패키지 매니저 및 실행 환경은 pnpm을 사용한다.
- 포맷팅과 린트는 Biome로 일원화한다.

## 4. 정보 구조

### 페이지

- `/`
- `/auth/login`
- `/auth/signup`

### 페이지 역할

- `/`
  - 프로젝트 소개 및 인증 샘플 진입 페이지
  - 로그인/회원가입 링크 제공
- `/auth/login`
  - 이메일/비밀번호 입력
  - mock 로그인 요청 처리
- `/auth/signup`
  - 이름/이메일/비밀번호/비밀번호 확인 입력
  - mock 회원가입 요청 처리

## 5. 제안 디렉터리 구조

```text
.
├── package.json
├── biome.json
├── components.json
├── tsconfig.json
├── next.config.ts
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── providers.tsx
│   │   └── auth/
│   │       ├── login/
│   │       │   └── page.tsx
│   │       └── signup/
│   │           └── page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   └── auth-shell.tsx
│   │   └── ui/
│   ├── features/
│   │   └── auth/
│   │       ├── components/
│   │       │   ├── login-form.tsx
│   │       │   └── signup-form.tsx
│   │       ├── hooks/
│   │       │   └── use-auth-mutation.ts
│   │       ├── lib/
│   │       │   └── mock-auth-api.ts
│   │       ├── schema/
│   │       │   └── auth.schema.ts
│   │       ├── store/
│   │       │   └── auth.store.ts
│   │       └── types/
│   │           └── auth.ts
│   └── lib/
│       ├── query-client.ts
│       └── utils.ts
└── README.md
```

## 6. 구현 계획

### Task 1: 프로젝트 부트스트랩 구성

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `biome.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] Next.js App Router + TypeScript + Tailwind 기반 프로젝트를 pnpm으로 초기화한다.
- [ ] Biome 설정을 추가하고 포맷/린트 명령을 `package.json` 스크립트로 연결한다.
- [ ] 기본 홈 페이지와 루트 레이아웃을 생성한다.
- [ ] 절대 경로 alias `@/*`를 사용할 수 있도록 정리한다.

**Run:**
- `pnpm install`
- `pnpm run lint`
- `pnpmx tsc --noEmit`

**Expected:**
- 의존성 설치 성공
- Biome 검사 통과
- TypeScript 오류 없음

### Task 2: UI 기초 및 shadcn/ui 세팅

**Files:**
- Modify: `src/app/globals.css`
- Create: `components.json`
- Create: `src/components/ui/*`
- Create: `src/components/layout/auth-shell.tsx`

- [ ] shadcn/ui를 초기화하고 폼 구현에 필요한 기본 컴포넌트를 추가한다.
- [ ] 인증 화면에 공통으로 사용할 `auth-shell` 레이아웃 컴포넌트를 만든다.
- [ ] 컬러, spacing, form width, card 스타일 등 최소 디자인 기준을 정한다.

**권장 shadcn/ui 컴포넌트**
- `accordion`
- `badge`
- `button`
- `card`
- `calendar`
- `combobox`
- `form`
- `input`
- `label`
- `empty`
- `field`
- `alert`
- `alert-dialog`
- `dialog`
- `input`
- `input-group`
- `item`
- `pagination`
- `scroll-area`
- `progress`
- `radio-group`
- `select`
- `skeleton`
- `sonner`
- `switch`
- `spinner`
- `tabs`



### Task 3: 전역 Provider 구성

**Files:**
- Create: `src/app/providers.tsx`
- Create: `src/lib/query-client.ts`
- Modify: `src/app/layout.tsx`

- [ ] TanStack Query `QueryClientProvider`를 전역에 연결한다.
- [ ] 1차 범위에서는 `useMutation` 위주로 사용할 수 있도록 최소 설정만 둔다.
- [ ] 향후 theme, toast, auth provider를 추가해도 확장 가능한 구조를 유지한다.

### Task 4: 인증 도메인 타입과 스키마 정의

**Files:**
- Create: `src/features/auth/types/auth.ts`
- Create: `src/features/auth/schema/auth.schema.ts`

- [ ] 로그인 입력 타입과 회원가입 입력 타입을 정의한다.
- [ ] `loginSchema`, `signupSchema`를 Zod로 작성한다.
- [ ] 비밀번호 확인 일치 검증, 이메일 형식 검증, 최소 길이 검증을 포함한다.
- [ ] 모든 폼 컴포넌트는 이 스키마를 단일 진실 원천으로 사용한다.

### Task 5: mock 인증 API 작성

**Files:**
- Create: `src/features/auth/lib/mock-auth-api.ts`

- [ ] 실제 서버 대신 Promise 기반 mock 함수로 회원가입/로그인 요청을 흉내 낸다.
- [ ] 로딩 상태가 보이도록 약간의 지연 시간을 둔다.
- [ ] 특정 이메일 조합에서 실패 케이스를 반환하도록 해 에러 UI를 검증 가능하게 한다.

**예시 정책**
- `fail@example.com` 입력 시 로그인 실패
- 이미 가입된 이메일 패턴 입력 시 회원가입 실패

### Task 6: Zustand 인증 상태 스토어 작성

**Files:**
- Create: `src/features/auth/store/auth.store.ts`

- [ ] 최소 상태만 저장한다.
- [ ] 예시 상태는 `isAuthenticated`, `user`, `setUser`, `clearUser` 수준으로 제한한다.
- [ ] 실제 보안 저장소 역할은 하지 않고 프론트 샘플 상태 표시용으로만 사용한다.

### Task 7: 공통 인증 mutation 훅 작성

**Files:**
- Create: `src/features/auth/hooks/use-auth-mutation.ts`

- [ ] `useLoginMutation`, `useSignupMutation` 형태로 분리한다.
- [ ] 내부적으로 TanStack Query `useMutation`을 사용한다.
- [ ] 성공 시 Zustand 상태를 갱신하고, 실패 시 에러 메시지를 반환한다.
- [ ] API 세부 구현과 폼 컴포넌트를 직접 결합하지 않는다.

### Task 8: 로그인 페이지 구현

**Files:**
- Create: `src/app/auth/login/page.tsx`
- Create: `src/features/auth/components/login-form.tsx`

- [ ] `auth-shell` 안에 로그인 폼을 렌더링한다.
- [ ] React Hook Form + Zod resolver를 사용한다.
- [ ] 제출 중 버튼 disabled, 로딩 텍스트, 에러 메시지, 성공 상태를 표시한다.
- [ ] 회원가입 페이지로 이동 링크를 제공한다.

### Task 9: 회원가입 페이지 구현

**Files:**
- Create: `src/app/auth/signup/page.tsx`
- Create: `src/features/auth/components/signup-form.tsx`

- [ ] 이름, 이메일, 비밀번호, 비밀번호 확인 입력 필드를 구현한다.
- [ ] 검증 실패 메시지를 필드 단위로 표시한다.
- [ ] 회원가입 성공 시 로그인 페이지로 유도하거나 자동 로그인 mock 흐름 중 하나를 선택한다.
- [ ] 로그인 페이지로 이동 링크를 제공한다.

**권장안**
- 1차 범위에서는 회원가입 성공 후 로그인 페이지 이동이 가장 단순하고 명확하다.

### Task 10: 홈 화면 및 인증 상태 샘플 연결

**Files:**
- Modify: `src/app/page.tsx`

- [ ] 홈 화면에서 현재 인증 상태 예시를 보여준다.
- [ ] 로그인/회원가입 이동 버튼을 배치한다.
- [ ] 로그인 성공 후 돌아왔을 때 상태가 보이는 샘플 UX를 제공한다.

### Task 11: Motion 기반 마이크로 인터랙션 추가

**Files:**
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/features/auth/components/signup-form.tsx`

- [ ] 카드 등장 애니메이션 또는 에러 메시지 전환 정도만 추가한다.
- [ ] 과한 페이지 전환 애니메이션은 넣지 않는다.
- [ ] 접근성을 해치지 않는 수준으로 유지한다.

### Task 12: 품질 점검 및 문서 정리

**Files:**
- Modify: `README.md`

- [ ] 실행 방법, 사용 스택, 구현 범위, mock 정책을 README에 정리한다.
- [ ] 아래 검증 명령이 모두 통과하는지 확인한다.

**Run:**
- `pnpm run dev`
- `pnpm run lint`
- `pnpmx tsc --noEmit`

**Expected:**
- 개발 서버 실행 성공
- Biome 검사 통과
- TypeScript 오류 없음

## 7. 수용 기준

- `/login`과 `/signup` 페이지가 정상 렌더링된다.
- 각 폼은 필수 입력값과 형식 검증을 수행한다.
- 잘못된 값 입력 시 사용자 친화적인 오류 메시지가 보인다.
- 제출 중 로딩 상태가 보인다.
- mock 성공/실패 케이스를 화면에서 확인할 수 있다.
- 로그인 성공 시 클라이언트 인증 상태가 갱신된다.
- 홈 화면에서 샘플 인증 상태를 확인할 수 있다.
- 코드가 feature 단위로 분리되어 이후 실제 API 연동이 가능하다.
- `pnpm run lint` 및 `pnpmx tsc --noEmit`가 통과한다.

## 8. 리스크와 대응

### TanStack Query 과사용 리스크

실제 API가 없는 범위에서 Query를 과하게 쓰면 구조가 불필요하게 복잡해질 수 있다.
대응으로 1차 범위에서는 mutation 중심으로만 사용한다.

### Zustand 중복 상태 리스크

폼 상태를 Zustand에 넣으면 React Hook Form과 역할이 충돌한다.
대응으로 전역 인증 상태만 Zustand에 둔다.

### shadcn/ui 의존 과다 리스크

초기 템플릿에서 너무 많은 컴포넌트를 설치하면 구조가 무거워진다.
대응으로 로그인/회원가입에 필요한 최소 컴포넌트만 도입한다.

## 9. 후속 확장 방향

- Next.js Route Handler 기반 실제 API 연결
- 서버 검증 및 쿠키/세션 처리
- 회원 정보 페이지 추가
- 비밀번호 재설정 플로우
- 테스트 러너 도입(Vitest 또는 Playwright)
- OAuth 로그인 확장
