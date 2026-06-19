<!-- forge-slug: settings-screen -->
# run — 설정 화면(개인 설정 + LLM 설정) 프론트 mock 구현

실행 방식: Dynamic Workflow가 아니라 **단일 에이전트 직접 순차 구현**(fg-run의 "단일 에이전트 규모면 워크플로우 생략" 지침). 공유 프론트 트리(`routeTree.gen.ts`·`app-shell`·공용 컴포넌트)를 병렬 에이전트가 동시 편집하면 충돌 위험이 커서 직접 처리가 더 안전·저렴.

## Plan vs actual

### 계획대로 된 것
- S1~S4 전부 계획대로 구현. 4개 슬라이스의 완료 기준 모두 충족.
- 검증 통과: `pnpm typecheck`(tsc --noEmit) 무에러, `biome check` 무수정, `vite build` 성공(settings·llm·account 청크 생성).
- 비목표 침범 없음: BYOK·작업별 티어·온도/메모리 노브·i18n·알림 미구현. 백엔드 연동 미착수.
- 영속화: `sw-settings` zustand persist(localStorage)로 프로필·티어 유지. 테마는 기존 `use-theme`의 자체 `theme` 키 사용(즉시 적용).

### Divergences (모두 경미, 구현 적응)
1. **UI 프리미티브가 Base UI(`@base-ui/react`)** — Radix가 아님. `AlertDialogTrigger`에 `asChild`가 없어 Base UI 관용인 `render={<Button variant="destructive" />}`로 작성. 계획엔 미명시였던 라이브러리 사실.
2. **`AuthUser` 타입에 표시이름·아바타·provider 없음**(email/role만). auth 도메인을 건드리지 않고 표시이름·아바타·provider를 `settings.store`에서 모델링(외과적 변경). provider 기본값 `email`이라 비밀번호 변경 섹션이 노출됨; OAuth 분기는 안내 카드로 구현(런타임에 provider를 'google' 등으로 바꾸면 안내로 전환).
3. **라우트 트리 재생성** — `tsr` CLI 미설치라 `vite build`로 `routeTree.gen.ts` 재생성. (수정 금지 자동생성 파일이므로 직접 편집 안 함.)
4. **계정 탈퇴 mock 동작** = `logout()` + `/auth/login` 이동. 이동으로 다이얼로그가 언마운트되어 별도 닫기 불필요. 단, persist된 `sw-settings`는 비우지 않음(mock 한정 — 백엔드 도입 시 정리 대상).
5. **레이아웃 라우트 패턴** — 기존 코드베이스는 레이아웃 라우트 없이 화면별 Shell 컴포넌트를 쓰지만, 플랜 합의(`/settings` 레이아웃+Outlet)대로 `settings.tsx`(layout)+`settings/index.tsx`(account로 redirect)+`account|llm.tsx` 중첩 구조 채택.

### 코드 리뷰(조건부)
- 변경이 auth·데이터 변형·공개 API·마이그레이션 등 위험 영역에 닿지 않는 프론트 mock(localStorage)이라 별도 리뷰 페이즈 생략(저위험). 잔여 critical 없음.

## 변경 파일
- 신규: `web/src/features/settings/{types/settings.ts, schema/settings.schema.ts, store/settings.store.ts, components/{settings-section,settings-shell,account-screen,llm-screen}.tsx}`
- 신규 라우트: `web/src/routes/settings.tsx`, `web/src/routes/settings/{index,account,llm}.tsx`
- 수정: `web/src/components/layout/sidebar-parts.tsx`(SettingsRow의 "설정" 버튼 → `/settings` Link)
- 자동 재생성: `web/src/routeTree.gen.ts`
- 용어집: `.forge/CONTEXT.md`에 품질 티어 추가(fg-ask 단계). ADR-0004 추가(fg-ask 단계).
