---
last_mapped_commit: eb5beed32c31e9684f037e4fe859795901adf0fd
mapped: 2026-06-21
---

# CONCERNS — web 프론트엔드 기술 부채·취약 지점

UI 우선 단계의 산물로, 대부분의 화면이 mock 시드 데이터로 동작하고 실 API는 배선만 돼 있다. 아래는 코드를 직접 확인한 사실 기반의 우려 사항이다.

## 1. UI-first/mock 단계 — 실 API 미연결

- 모든 화면 데이터는 `web/src/features/shared/mock/works.ts`의 시드를 `web/src/features/shared/store/works.store.ts`(Zustand + immer)에 채워 동작한다. 인증 상태도 `web/src/features/auth/store/auth.store.ts`에서 `isAuthenticated: true`로 시드 로그인된 목업이며 `persist`로 localStorage(`sw-auth`)에 영속화한다.
- 생성된 API SDK·타입(`web/src/api/**`)은 `web/src/lib/api-client.ts`와 `web/src/lib/api-interceptors.ts` 단 두 곳에서만 import 된다. `src/features/**`·`src/routes/**` 어디에서도 생성 SDK나 TanStack Query 훅(`useQuery`/`useMutation`)을 쓰지 않는다 — 즉 **실제 백엔드 호출 경로가 0개**다.
- `QueryClientProvider`는 `web/src/providers/app-providers.tsx`에 마운트돼 있으나 실제로 쓰는 쿼리가 없어 현재는 무동작 배선이다.
- 인터셉터(`web/src/lib/api-interceptors.ts`)는 요청을 그대로 통과시키는 빈 패스스루다. 주석상 토큰 주입·401 갱신은 Phase 3으로 미뤄져 있다 — 인증 도입 전까지 보호 자원 호출은 인증 헤더 없이 나간다.
- 영향: "기능 동작"으로 보이는 거의 모든 버튼이 실제로는 `toast(... 목업)`만 띄운다(`web/src/features/editor/components/manuscript.tsx`의 저장·요약·장면 이미지·다시쓰기·전체화면, `web/src/features/auth/components/auth-form-parts.tsx`의 소셜 로그인, `web/src/features/timeline/components/timeline-screen.tsx`의 씬 이동 등).

## 2. 에디터 본문 편집이 휘발성 (영속 안 됨)

- `web/src/features/editor/components/manuscript.tsx`의 tiptap 에디터는 `scene.paragraphs`로 초기 콘텐츠를 만들 뿐, 편집 결과를 어떤 스토어에도 다시 쓰지 않는다. `onUpdate`·`onBlur` 등 변경 영속 핸들러가 없어 라우트 이동·새로고침 시 본문 편집이 전부 사라진다.
- 예외: 챕터 제목 입력은 `onChange`에서 `renameChapter(work.id, chapter.id, ...)`(`works.store.ts:99`)로 스토어에 즉시 반영된다 — 제목만 살아남고 본문은 휘발하는 비대칭이 사용자 혼란을 유발한다.
- 하단 상태바의 "자동 저장 완료" 표시(`manuscript.tsx`)는 장식이다 — 저장 로직과 무관하게 항상 같은 문구·시각(`오후 2:34`)·진행률(고정 `8%`)을 렌더한다.
- 읽기 모드(`web/src/features/editor/components/reading-screen.tsx`)는 `chapter.scenes`의 `paragraphs`를 읽기 전용으로 평탄화해 보여줄 뿐 편집 영속과 무관하다 — 위 휘발성 문제와 직접 충돌하지는 않으나, 영속되지 않은 편집은 읽기 모드에도 반영되지 않는다.

## 3. 죽은 코드 / 미사용 필드

- `acceptInlineSuggestion` 액션(`web/src/features/shared/store/works.store.ts:85`)은 인터페이스·구현에만 존재하고 컴포넌트 호출처가 0개다(인라인 AI 고스트 제거 후 남은 잔재). 같은 파일의 `acceptSuggestion`·`dismissSuggestion`·`dismissConflict`·`addWork`는 모두 실제 호출처가 있어 대조적으로 이것만 떠 있다.
- `scene.aiSuggestion` 필드(`web/src/features/shared/types.ts:31`)와 그 시드 값(`web/src/features/shared/mock/works.ts:95`)은 위 죽은 액션 외에 어떤 UI에서도 렌더되지 않는다.
- 제거는 사용자 요청 사안이라 본 매핑에서는 기록만 한다.

## 4. 번들 크기 — vite >500kB 경고 발생

`pnpm build`(커밋 `eb5beed`) 실측:

- write 라우트 청크 `dist/assets/_sceneId-*.js` = **425.14 kB**(gzip 134.84 kB). tiptap·StarterKit가 이 청크에 번들된다.
- 메인 벤더 청크 `dist/assets/index-*.js` = **594.08 kB**(gzip 194.72 kB) — 이것이 vite의 `>500kB` 경고를 실제로 트리거하는 청크다.
- `web/vite.config.ts`에 `build.rollupOptions.output.manualChunks`나 `chunkSizeWarningLimit` 설정이 없어 경고가 매 빌드마다 출력된다.

## 5. 백엔드 프록시 포트 불일치

`web/vite.config.ts`의 dev 프록시는 `/api` → `http://localhost:8080`으로 보내는데, `CLAUDE.md`는 `api/README.md`의 dev 서버 기본 포트가 `:8000`이라 불일치가 있다고 명시한다. 로컬 풀스택 구동 시 프록시 타깃과 실제 API 포트를 수동으로 맞춰야 호출이 닿는다.

## 6. 생성 파일 — 손대지 않음

`web/src/routeTree.gen.ts`(TanStack Router 빌드 산물)와 `web/src/api/**`(openapi-ts 산물)는 생성물이며 tsc/biome 대상에서 제외돼 있다. 직접 편집은 다음 `pnpm generate`/빌드에서 덮어쓰이므로 금지다.

## 7. 검증 공백 — 자동 테스트 부재

`CLAUDE.md` 기재대로 web에는 테스트 러너(vitest/jest)가 없다. 회귀 방지가 전적으로 `pnpm typecheck` + `pnpm lint`에 의존하므로, 위 2번(휘발성 편집)·3번(죽은 코드) 같은 런타임 동작 결함은 타입·린트 통과만으로는 잡히지 않는다.
