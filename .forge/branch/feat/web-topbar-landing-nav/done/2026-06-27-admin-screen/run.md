# run — 관리자 화면 (목업 UI)

slug: admin-screen · 실행일: 2026-06-27 · 워크플로우: 미사용(직접 실행)

## 실행 방식

셸→화면→통계 직렬 의존이라 병렬 이득 없음 + eco=on → Dynamic Workflow 대신 직접 실행.

## 계획대로 된 것

- **슬라이스 1** — `auth/lib/guard.ts`에 `requireAdmin` 추가, `auth.store` 시드 `role: 'ADMIN'`, `user-menu.tsx`에 ADMIN 전용 "관리자" 드롭다운 항목(ShieldCheck), `admin-shell.tsx`(SettingsShell 패턴 2단 셸), 라우트 `admin.tsx`(레이아웃, `requireAdmin`) + `admin/index.tsx`(계정 승인) + `admin/stats.tsx`(통계).
- **슬라이스 2** — `features/admin/types.ts`(Member/MemberStatus), `mock/members.ts`(6명 혼합 상태), `store/admin.store.ts`(approveMember/rejectMember), `account-approval-screen.tsx`(승인 대기 큐 + 승인/거부 + 토스트 + 전체 목록 + 상태 필터).
- **슬라이스 3** — `admin-stats-screen.tsx`(3섹션 9카드: 회원/작품/API 호출). 회원·작품은 store에서 라이브 집계, API 호출은 mock 수치.

## 계획과 다른 것 (divergence — 중간)

- **persist 키 버전업(`sw-auth` → `sw-auth-v2`)** — 계획에 없던 추가 변경. 시드 `role`을 ADMIN으로 바꿔도 기존 localStorage('sw-auth', role:'USER')가 rehydrate로 덮어써 `/admin`이 막히는 버그를 UAT 중 발견. persist 키를 올려 stale 상태를 무효화. (목업 인증의 알려진 함정 — 시드 기본값 변경은 persist 키 갱신을 동반해야 함.)
- `AuthUser.role`에 이미 `'ADMIN'`이 있어 타입 확장 불필요(계획의 "필요 시 확장" 조건 미발생).
- biome 포맷 자동 수정 2건(삼항식 한 줄화) — 기능 영향 없음.

## 검증 (UAT — playwriter)

- ADMIN 시 사용자 컨텍스트 메뉴에 "관리자" 노출 → 클릭 시 `/admin` 2단 셸 진입(좌측 메뉴: 작품으로/계정 승인/통계).
- 계정 승인: 승인 대기 3건 → 첫 회원 승인 시 대기 3→2, 토스트, 통계의 승인됨/대기 라이브 반영(승인됨 3·대기 2). 상태 필터 동작.
- 통계: 3섹션 9카드 렌더(회원 6/3/2, 작품 3·총화 61·누적 23.5만자, API mock).
- 역할 게이트: localStorage role을 USER로 두고 `/admin` 직접 진입 시 `/works`로 리다이렉트.
- `pnpm typecheck` 통과 · `pnpm lint` 통과(133 파일).
