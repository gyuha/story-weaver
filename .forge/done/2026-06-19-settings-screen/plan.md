<!-- forge-slug: settings-screen -->
<!-- task: 2 -->
<!-- tdd: off -->
# 설정 화면(개인 설정 + LLM 설정) 프론트 mock 구현

## Goal / Non-goals
- Goal: web에 `/settings` 화면을 추가한다. 좌측 세로 네비 + 중첩 라우트로 **개인 설정**(`/settings/account`)과 **LLM 설정**(`/settings/llm`) 두 섹션을 제공한다. 상태는 zustand+persist(localStorage) mock으로 저장한다.
- Non-goals:
  - 백엔드 연동(사용자별 설정 저장 API, `LLMSettings` 사용자화, 티어→실제 모델 매핑) — 후속 작업.
  - BYOK(사용자 API 키 입력), 작업 종류별 티어, 창의성/온도·메모리 적극성 등 추가 노브.
  - i18n 언어 설정(현재 `sample/` 템플릿 잔재라 제외).
  - 알림 설정.

## Source of truth
- Glossary terms: [[품질 티어]], [[모델 스위칭]] (`.forge/CONTEXT.md`)
- Related ADRs: `.forge/adr/0004-user-llm-setting-as-quality-tier.md`(사용자 LLM 설정 = 품질 티어, BYOK 배제, 전역 단위), `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`(티어→모델 매핑의 상위 근거)
- Definition of Done: 로그인 상태에서 사이드바 사용자 메뉴 → "설정" 진입 시 `/settings/account`가 열리고, 개인 설정 4항목(프로필/테마/비밀번호/탈퇴)과 LLM 설정(전역 품질 티어)이 mock으로 동작하며, 새로고침 후에도 변경값이 유지된다.

## Work slices
- [ ] S1. `/settings` 레이아웃 라우트 + 중첩 라우트 골격 — completion criterion: `/settings` 진입 시 좌측 세로 네비(개인 설정/LLM 설정)와 우측 `<Outlet>`이 렌더되고, `/settings`는 `/settings/account`로, `/settings/account`·`/settings/llm` URL이 각각 매칭된다(`routeTree.gen.ts` 자동 갱신). `app-shell` 사이드바 하단 사용자 메뉴에 "설정" 진입점이 있다.
- [ ] S2. `features/settings/` 모듈(store/types/schema) — completion criterion: `settings.store.ts`(zustand + persist→localStorage)가 프로필 필드와 품질 티어 enum(`저비용`/`균형`/`고품질`, 기본 `균형`)을 보유하고, zod 스키마(프로필·비밀번호 변경)가 정의된다. 컨벤션(`*.store.ts`/`*.schema.ts`, kebab-case) 준수.
- [ ] S3. 개인 설정 화면 `/settings/account` — completion criterion: 프로필(표시이름/아바타/이메일) 폼 + 테마 토글(기존 `use-theme` 연동, 즉시 적용) + 비밀번호 변경(이메일 가입 계정만 노출, OAuth 계정은 "소셜 로그인 계정" 안내로 대체) + 하단 Danger Zone의 계정 탈퇴(`AlertDialog` 확인 → mock 로그아웃)가 렌더된다. 프로필/비밀번호는 섹션별 "저장" 버튼 + `sonner` 토스트, 저장값은 새로고침 후 유지. (depends: S1, S2)
- [ ] S4. LLM 설정 화면 `/settings/llm` — completion criterion: 전역 품질 티어 선택(저비용/균형/고품질) UI와 각 티어가 무엇을 의미하는지(모델 스위칭이 이 티어 기준으로 동작) 설명 텍스트가 렌더된다. "저장" 버튼 + 토스트, 선택값은 새로고침 후 유지. 구체 모델명·API 키·creativity 노브는 노출하지 않는다(ADR-0004). (depends: S1, S2)
