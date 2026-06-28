<!-- forge-slug: admin-screen --><!-- task: 18 --><!-- tdd: off -->

# 관리자 화면 (목업 UI — 계정 승인 + 통계)

## Goal

관리자 권한(`role === 'ADMIN'`) 사용자가 컨텍스트 메뉴에서 진입하는 2단 레이아웃 관리자 화면을 목업으로 만든다. 좌측 관리자 메뉴 + 우측 콘텐츠 구성이며, **계정 승인**(가입 계정의 사용 허가)과 **운영 통계**를 제공한다. 기존 디자인(특히 `settings-shell.tsx`)과 조화시킨다.

## 범위 결정 (중요)

- **목업 UI 우선** — 현 프로젝트 단계(UI-first)와 일치. 실제 사용자를 강제로 차단하지 않으며, 승인·통계 모두 mock 데이터로 동작하는 화면이다. 실제 백엔드 강제(승인 상태 컬럼·admin 엔드포인트·프론트 실제 인증 배선)는 **별도 후속 작업**으로 분리(비목표).
- 백엔드엔 이미 RBAC(User/Role/Permission, `is_active`/`is_verified`)가 있으나 "관리자 승인 대기" 상태는 없음 — 이번엔 건드리지 않음.

## Non-goals (이번에 안 함)

- 실제 백엔드 연동/강제 (승인 상태 마이그레이션, admin API, 로그인 차단, 프론트 실제 인증 배선)
- 승인 취소/정지(approved→suspended), 역할 부여·변경, 일괄 승인, 회원 검색, 회원 상세 페이지
- 거부 사유 입력
- 통계: 차트 라이브러리 도입, 기간 필터, 실시간, CSV 내보내기 (카드/간단 표시·한 페이지로 한정)

## Source of truth (glossary)

- **관리자 (Admin)** · **계정 승인 (Account Approval)** · **회원 (Member)** — `.forge/branch/feat/web-topbar-landing-nav/CONTEXT.md` (이번 그릴링에서 추가).
- 레이아웃 선례: `web/src/features/settings/components/settings-shell.tsx` (좌 `w-60` aside 네비 + 우 `<Outlet>`, 중첩 라우트).
- 컨텍스트 메뉴: `web/src/components/layout/user-menu.tsx` (드롭다운).
- 인증 상태: `web/src/features/auth/store/auth.store.ts` (`AuthUser.role`), `web/src/features/auth/lib/guard.ts` (`requireAuth`).

## Decisions

- **접근은 역할 게이트**: `/admin`은 `requireAuth` + `role === 'ADMIN'` 확인, USER가 URL 직접 진입 시 `/works`로 리다이렉트. 컨텍스트 메뉴의 "관리자" 항목은 ADMIN일 때만 노출. (가역적 — ADR 미작성)
- **목업 역할 시드**: `auth.store`의 시드 사용자 `role`을 `'ADMIN'`으로 두어 개발 중 화면이 보이게 함. (가역적)
- **2단 셸은 `SettingsShell` 패턴 재사용** — 같은 aside/네비 클래스·중첩 라우트로 디자인 조화. (가역적)

## Slices

### 1. 관리자 진입 + 2단 셸 + 역할 게이트

- `auth.store.ts` 시드 사용자 `role: 'ADMIN'`으로 변경. (`AuthUser` 타입에 `'ADMIN'` 허용되는지 확인, 필요 시 타입 확장)
- `user-menu.tsx` 드롭다운에 "관리자" 항목 추가 — `user?.role === 'ADMIN'`일 때만 노출, `/admin`으로 이동(Shield 계열 아이콘).
- `admin-shell.tsx` — `SettingsShell` 패턴의 2단 레이아웃(좌측 관리자 메뉴: 계정 승인 / 통계, 우측 `<Outlet>`). "작품으로" 복귀 링크 포함.
- 라우트: `admin.tsx`(레이아웃, `beforeLoad`에서 `requireAuth` + 비-ADMIN은 `/works` 리다이렉트) + `admin.index.tsx`(계정 승인) + `admin.stats.tsx`(통계).
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과. playwriter로 ADMIN 시 컨텍스트 메뉴에 "관리자" 표시 → 클릭 시 `/admin` 2단 화면 진입, 좌측 메뉴 2개 항목 확인.

### 2. 계정 승인 (`/admin` 인덱스)

- 회원 mock 타입 + 시드(다수): `id · 이메일 · 표시이름 · 가입일 · 상태(pending|approved|rejected) · 작품 수`.
- mock store(`admin.store.ts` 또는 기존 store 패턴 따름)에 회원 목록 + `approveMember`/`rejectMember` 뮤테이션.
- 화면: 상단 **승인 대기 큐**(pending 목록 + 각 행 승인/거부 버튼 + 토스트), 하단 **전체 회원 목록**(상태 배지 + 상태별 필터).
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과. playwriter로 pending 회원 승인 → 상태 approved로 이동·토스트, 거부 동작, 상태 필터 동작 확인.

### 3. 통계 (`/admin/stats`)

- 한 페이지 개요, mock stat 카드:
  - 회원: 전체 / 승인됨 / 대기 수 (슬라이스 2의 회원 데이터에서 집계)
  - 작품(소설): 전체 작품 수 · 총 화수 · 총 글자수 (works mock에서 집계, 부족하면 mock 숫자)
  - API 호출: 총 호출 수 · 대략 비용 (mock 숫자)
- 디자인은 기존 카드/타이포 스타일과 조화(차트 라이브러리 없이).
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과. playwriter로 `/admin/stats` 카드 렌더 확인.
