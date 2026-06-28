---
last_mapped_commit: 1331c286f88b0298e21191c6b40df3d50b3e2820
mapped: 2026-06-27
---

# StoryWeaver 디렉터리 구조

## monorepo 최상위

- `api/` — FastAPI 백엔드. 자체 `api/CLAUDE.md` 존재.
- `web/` — React 프론트엔드.
- `docs/` — 제품 설계 문서: `PRD.md`·`architecture.md`·`data-model.md`·`ai-pipeline.md`·`image-generation.md`·`roadmap.md`. (생성용 `docs/openapi.json`이 web 타입 생성 입력.)
- `.forge/` — 도메인 용어집(`CONTEXT.md`)·결정 기록(`adr/`)·백로그/완료/회고/quick·이 코드맵(`codebase/`).
- 루트 기타: `CLAUDE.md`, `README.md`, `기획.md`, `Taskfile.yml`(루트 + 각 패키지에 별도 `Taskfile.yml`).

---

## web/ 구조

### 패키지 루트 (`web/`)

설정 파일: `package.json`·`pnpm-lock.yaml`·`pnpm-workspace.yaml`·`vite.config.ts`·`tsconfig.json`(+ `tsconfig.node.json`)·`biome.json`·`components.json`(shadcn 설정)·`openapi-ts.config.ts`·`index.html`. 문서: `README.md`·`DESIGN.md`·`PRD.md`. 빌드 산출물 `dist/`.

### `web/src/`

- `main.tsx` — 앱 부트스트랩(진입점).
- `routeTree.gen.ts` — **생성물(수정 금지)**. 라우터 플러그인이 `routes/`에서 생성.
- `vite-env.d.ts`
- `api/` — **생성물(수정 금지)**. `client.gen.ts`·`sdk.gen.ts`·`types.gen.ts`·`index.ts`·`core/`·`client/`·`@tanstack/`(Query 훅).
- `lib/` — `router.ts`·`api-client.ts`·`api-interceptors.ts`·`utils.ts`.
- `providers/` — `app-providers.tsx`(QueryClientProvider).
- `stores/` — 전역 모달 store: `modal-store.ts`·`modal.types.ts`.
- `hooks/` — `use-mobile.ts`·`use-theme.ts`.
- `styles/` — `globals.css`.
- `components/` — feature 횡단 공유 UI:
  - `components/ui/` — 디자인 시스템 원자(button·input·dialog·table·tabs·select·form·card·badge·calendar·command·popover·dropdown-menu·sonner 등) + `ui/modal/`(modal-manager·modal-container·modal-form·modal-header·modal-backdrop·modal-default·modal).
  - `components/layout/` — `app-shell.tsx`·`work-shell.tsx`·`top-bar.tsx`·`user-menu.tsx`·`work-tree.tsx`·`sidebar-parts.tsx`·`logo-mark.tsx`. `user-menu.tsx`는 `user?.role === 'ADMIN'`일 때만 `/admin` "관리자" 링크를 노출한다.
  - `components/dev/` — `form-devtool.tsx`. `components/theme-toggle.tsx`.

### `web/src/features/` — 도메인 (기능 단위)

도메인: `auth · works · world-bible · editor · timeline · memory · settings · shared · landing · admin`.
하위 폴더 관용: `components / store / types / schema / lib / mock`(도메인마다 일부만 존재). 도메인 공유 코드는 `features/shared/`.

- `features/auth/`
  - `components/`: `login-page.tsx`·`signup-page.tsx`·`auth-layout.tsx`·`auth-form-parts.tsx`
  - `store/auth.store.ts`(`useAuthStore`, `persist` 미들웨어, localStorage 키 `sw-auth-v2`), `lib/guard.ts`(`requireAuth`·`requireAdmin`), `schema/auth.schema.ts`, `types/auth.ts`(`AuthUser.role: 'USER' | 'ADMIN'`)
- `features/works/`
  - `components/`: `dashboard-screen.tsx`·`work-card.tsx`·`new-work-modal.tsx`
- `features/world-bible/` (엔티티 CRUD 화면 일습 — 생성·수정 모두 존재)
  - `components/`: `bible-screen.tsx`(World Bible 목록 셸), `entity-list.tsx`·`entity-detail.tsx`(목록/상세), `entity-form.tsx`(생성·수정 공유 폼 — `initial`·`lockType`·`heading`·`submitLabel`·`onSubmit` props, 유형별 필드는 `docs/data-model.md` 기반), `new-entity-screen.tsx`(엔티티 추가 화면), `edit-entity-screen.tsx`(엔티티 수정 화면)
- `features/editor/`
  - `components/`: `editor-screen.tsx`(집필/편집 모드), `manuscript.tsx`·`reading-screen.tsx`(읽기 모드), `selection-ai-menu.tsx`·`version-history-modal.tsx`
  - `lib/word-diff.ts`
- `features/timeline/`
  - `components/timeline-screen.tsx`
- `features/memory/`
  - `components/memory-panel.tsx`
- `features/settings/`
  - `components/`: `settings-shell.tsx`(2단 셸 — 좌측 네비 + 우측 Outlet)·`settings-section.tsx`·`account-screen.tsx`·`llm-screen.tsx`
  - `store/settings.store.ts`, `schema/settings.schema.ts`, `types/settings.ts`
- `features/landing/`
  - `components/landing-screen.tsx`
- `features/admin/` (신규 — 관리자 화면, 목업)
  - `components/admin-shell.tsx`(2단 셸 — 좌측 세로 네비 + 우측 Outlet, `settings/components/settings-shell.tsx` 패턴을 미러링), `components/account-approval-screen.tsx`(회원 승인/거부·상태 필터), `components/admin-stats-screen.tsx`(회원·작품 집계 통계)
  - `store/admin.store.ts`(`useAdminStore`, immer — `members`·`approveMember`·`rejectMember`)
  - `mock/members.ts`(`seedMembers`)
  - `types.ts`(`MemberStatus = 'pending' | 'approved' | 'rejected'`, `Member`)
- `features/shared/` (도메인 공유 — 작품 store가 여기 핵심)
  - `store/works.store.ts`(`useWorksStore`, immer), `store/selectors.ts`(파생 selector·헬퍼)
  - `mock/works.ts`(시드: `seedWorks`·`seedUsage`·`workspaceName`·`authorInitial`)
  - `types.ts`(도메인 공통 타입: Genre·Work·Scene·Entity·Chapter·Paragraph·SceneVersion 등, `docs/data-model.md` 기반)

### `web/src/routes/` — 파일 기반 라우트

- `__root.tsx` — 루트 레이아웃(providers·outlet·modals·toaster·devtools).
- `index.tsx` — `/` → `LandingScreen`.
- `auth/login.tsx`·`auth/signup.tsx`
- `settings.tsx`(레이아웃) + `settings/index.tsx`·`settings/account.tsx`·`settings/llm.tsx`
- 관리자 라우트 (신규):
  - `admin.tsx` — 레이아웃 라우트. `beforeLoad: () => requireAdmin('/admin')`, `component: AdminShell`.
  - `admin/index.tsx` — `/admin` 계정 승인. `AccountApprovalScreen` 마운트.
  - `admin/stats.tsx` — `/admin/stats` 통계. `AdminStatsScreen` 마운트.
- `works/index.tsx`(`/works` → `DashboardScreen`)·`works/new.tsx`
- `works/$workId/index.tsx` — 작품 홈
- `works/$workId/synopsis.tsx`·`works/$workId/timeline.tsx`
- `works/$workId/write/index.tsx`·`works/$workId/write/$sceneId.tsx` — 편집 모드(집필)
- `works/$workId/read/index.tsx`·`works/$workId/read/$chapterId.tsx` — 읽기 모드
- World Bible 라우트 (`bible*`):
  - `works/$workId/bible.tsx` — 레이아웃 라우트. `beforeLoad`에 `requireAuth`, `component: Outlet`.
  - `works/$workId/bible.index.tsx` — `/bible` 목록. `validateSearch`로 `entity` 검색값. `BibleScreen` 마운트.
  - `works/$workId/bible.new.tsx` — `/bible/new` 엔티티 추가. `beforeLoad: requireAuth`, `NewEntityScreen` 마운트.
  - `works/$workId/bible.edit.tsx` — `/bible/edit?entity=<id>` 엔티티 수정. `beforeLoad: requireAuth`, `validateSearch`로 `entity?: string`, `EditEntityScreen`에 `entityId={entity}` 전달.

라우트 파일 관용: `createFileRoute('<path>')({...})`로 `Route` export. 파라미터는 `useParams`, 검색값은 `useSearch`/`validateSearch`. 인증은 `beforeLoad: requireAuth`, 관리자 전용은 `beforeLoad: requireAdmin`. 점 표기(`bible.index.tsx`·`write/$sceneId.tsx`)·디렉터리(`admin/stats.tsx`) = 중첩 라우트.

---

## api/ 구조

### 패키지 루트 (`api/`)

설정: `pyproject.toml`·`uv.lock`·`alembic.ini`·`Justfile`·`Taskfile.yml`·`docker-compose.yml`(+`.prod`)·`Dockerfile`. 환경: `.env`/`.env.example`/`.env.prod.example`. 문서: `README.md`·`CLAUDE.md`. 디렉터리: `alembic/`·`scripts/`·`tests/`.

### `api/src/` (PYTHONPATH=src)

- `main.py`(FastAPI 앱)·`__main__.py`·`__init__.py`
- `core/` — `config.py`·`database.py`·`redis.py`·`middleware.py`·`exceptions.py`·`logging.py`
- `domains/`
  - `auth/` — `router/`·`service/`·`repository/`·`models/`·`schemas/` + `oauth/`(`google.py`·`kakao.py`·`naver.py`)·`security.py`·`email.py`. 각 5계층 폴더에 `<bc>_router.py` 식 단일 모듈(예: `router/auth_router.py`·`service/auth_service.py`·`repository/auth_repository.py`·`models/auth_models.py`·`schemas/auth_schemas.py`).
  - `chat/` — 동일 5계층(`chat_router.py` 등) + `container.py`·`ports.py`·`llm_client.py`·`llm_factory.py`.
  - `shared/` — `base.py`·`events.py`·`types.py`.
- `infra/llm/provider_factory.py`

### `api/alembic/`

마이그레이션 `versions/`(예: `0001_initial_schema.py`).

---

## 명명 규칙 요약

- **web 파일/디렉터리**: kebab-case(`new-entity-screen.tsx`·`admin-shell.tsx`·`work-tree.tsx`). store는 `<도메인>.store.ts`, 스키마는 `<도메인>.schema.ts`. feature 내부 폴더는 `components/store/types/schema/lib/mock` 고정 이름.
- **web 라우트**: TanStack 파일 규약 — 디렉터리·점·`$param`·`index`. 동적 세그먼트는 `$workId`·`$sceneId`·`$chapterId`.
- **web 식별자**: 컴포넌트 PascalCase, 훅 `useX`, selector `useX`/순수 헬퍼는 동사형.
- **web 생성물(편집 금지)**: `web/src/routeTree.gen.ts`, `web/src/api/**`(`*.gen.ts`).
- **api 모듈**: snake_case, 도메인 모듈 파일에 `<bc>_` 접두(`auth_service.py`). 5계층 폴더 이름 `router/service/repository/models/schemas` 고정.
- **경로 별칭**: `@/*` → `web/src/*`.
