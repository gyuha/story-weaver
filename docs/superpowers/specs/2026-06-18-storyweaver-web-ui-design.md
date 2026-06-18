# StoryWeaver 웹 UI 구현 설계

> 작성일: 2026-06-18 · 출처 디자인: Claude Design `StoryWeaver.dc.html` (Notion-style 웜페이퍼 목업)
> 관련 문서: `docs/PRD.md`, `docs/architecture.md`, `docs/data-model.md`

## 1. 목표와 범위

PRD MVP 3영역(**World Bible · 메모리 · Smart Editor**)을 디자인 목업에 맞춰 프론트엔드로 구현한다. 데이터는 목업 + 로컬 스토어로 채우되, 도메인별 `api` 모듈로 seam을 분리해 추후 실제 API 교체가 가능하게 둔다.

### 구현 화면 (7)
1. 작품 대시보드 — 작가의 모든 작품 + 사용량
2. 새 작품 만들기 — 장르/키워드/문체/제목 위저드 (대시보드 위 모달)
3. Smart Editor — 원고 에디터 + 작업트리 사이드바 + 메모리 사이드바 + 인라인 AI
4. World Bible — 엔티티 카드(인물·장소·사건·아이템) 목록/상세/편집, 동적 업데이트 제안
5. 타임라인 상태 · 검토
6. 로그인
7. 회원가입

### 변형 축 처리 (디자인 Section B/C/D)
디자인 보드의 변형(메모리 사이드바 3안·AI 인터랙션 3안·레이아웃 3안)은 탐색용이다. **Section A 정규 표현을 채택**한다:
- 메모리 사이드바: 리스트형 — "씬-엔티티 링크"와 "벡터 유사도 보조"를 시각적으로 구분.
- AI 생성: 인라인 고스트 텍스트 + `Tab 수락` / `Esc 취소`, 하단 툴바(이어쓰기·인필링·지문→대사·문체).
- 레이아웃: 좌(작업트리) · 중(원고, max-width 600px 중앙) · 우(메모리) 3컬럼. 좌/우 패널은 접기 가능.

### 비목표
- 실제 백엔드 연동(`api/`는 미구현 스캐폴딩), 실 LLM 스트리밍, v2+ 기능(Plot Architect·충돌 자동 감지·관계도·이미지 생성).
- 다크모드 디자인 시안 없음 → 라이트 우선. 토큰만 정의하고 기존 토글은 유지.

## 2. 디자인 토큰 (`src/styles/globals.css` 리테마)

기존 generic neutral/blue 테마를 StoryWeaver 팔레트로 교체한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| paper/background | `#ffffff` | 본문 표면 |
| sidebar | `#f5f5f4` | 좌측 사이드바 |
| board (선택) | `#e7e5df` | 인증 화면 등 외곽 |
| ink/foreground | `#37352f` | 본문 텍스트 |
| muted | `#787774`, `#9b9a97`, `#b9b8b3` | 보조 텍스트 |
| border | `rgba(55,53,47,0.09)`, `#e9e9e7`, `#d8d7d3` | 경계선 |
| primary (블루) | `#2383e2` | 1차 액션·선택 |
| ai (퍼플) | `#9065b0` | AI 어시스턴트/생성 |
| danger (레드) | `#d44c47` | 상태 경고(타임라인 모순) |
| success (그린) | `#548164` | 저장됨/긍정 |
| genre (오렌지) | `#cc782f` | 부/장르 라벨 |

- 폰트: UI=`Noto Sans KR`, 원고=`Noto Serif KR`. 기존 Inter 제거. Google Fonts `index.html`에 추가.
- radius: 버튼/카드 5~8px, 사이드바 항목 3~5px.
- Tailwind v4 `@theme inline` 변수에 위 색을 oklch/hex로 매핑하고 `--font-sans`/`--font-serif` 교체.

## 3. 도메인 구조 (`src/features/*`)

각 도메인은 `components/`, `store/`(zustand), `api/`(목업 seam), `types.ts`로 자기완결. 도메인 간 의존은 타입/스토어 셀렉터로만.

```
features/
  auth/          login-form, signup-form, auth.store (재구성)
  works/         dashboard, work-card, new-work-wizard(modal), works.store, works.api(mock)
  editor/        smart-editor, work-tree(사이드바), manuscript, ai-toolbar, ai-inline-suggest, editor.store
  world-bible/   bible-list, entity-card, entity-detail, update-suggestion, bible.store
  memory/        memory-panel(우측), memory-item(link/vector 구분), memory.store
  timeline/      timeline-review, timeline-row, timeline.store
  shared/
    mock/        무협 회귀물 시드(works·chapters·scenes·entities·timeline·memory)
    types.ts     공통 도메인 타입
components/layout/
  app-shell.tsx   전역 좌측 사이드바(작품 스위처·검색·AI·작품·최근작품·사용량·설정) + 상단바  → 대시보드
  work-shell.tsx  작품 내부: 작업트리 사이드바 + 콘텐츠 영역                                  → 에디터/바이블/타임라인
```

데이터 모델(간략, `docs/data-model.md` 기반):
- `Work` { id, title, genre, keywords[], style, chapters[], stats }
- `Chapter` { id, partLabel, title, scenes[] }
- `Scene` { id, title, content, status, linkedEntityIds[] }
- `Entity` { id, type: 인물|장소|사건|아이템, name, fields, timelineStates[] }
- `TimelineState` { id, entityId, chapterRef, state, note }
- `MemoryItem` { entityId, reason: 'link'|'vector', score? }

## 4. 라우팅 — URL로 상태 복구

TanStack Router 파일 기반. **네비게이션 상태(어느 작품·씬·엔티티·모달·탭)는 path/search param으로 인코딩**하여 새로고침·딥링크로 복구한다. 패널 접힘·모델 선택 등 UI 환경설정은 localStorage(URL 비오염).

```
/                              → 인증 시 /works, 미인증 시 /auth/login 리다이렉트
/auth/login
/auth/signup
/works                         작품 대시보드
/works/new                     새 작품 만들기 (대시보드 위 모달 오버레이)
/works/$workId                 → /works/$workId/write 리다이렉트
/works/$workId/write           Smart Editor (씬 미지정 시 마지막/첫 씬)
/works/$workId/write/$sceneId  특정 씬 열림 — 작업트리 펼침·원고·메모리 모두 $sceneId 기준 복구
/works/$workId/bible           World Bible (search: ?entity=$entityId, ?type=인물)
/works/$workId/timeline        타임라인 상태·검토 (search: ?entity=$entityId)
/works/$workId/synopsis        시놉시스
```

상태 복구 흐름:
```
URL 진입/새로고침 → 라우트 파라미터 파싱 → 스토어가 목업에서 해당 work/scene/entity 조회
                  → 작업트리 해당 씬까지 펼침 + 원고/메모리/카드 렌더
```

라우트 가드: 인증 스토어 미인증 → `/auth/login`로 `beforeLoad` 리다이렉트(목업 인증, 로그인 시 통과).

## 5. 제거 대상 (템플릿 잔재)

- `src/features/helpdesk/**`, `src/styles/helpdesk.css`, `src/sample/**`
- `__root.tsx`의 `HdToastHost`, `isSamplePath`, 샘플 의존 참조
- `main.tsx`의 `@fontsource-variable/inter`, `helpdesk.css`, `sample/i18n` import
- 본인 변경으로 고아가 된 import만 정리. 그 외 기존 UI 컴포넌트(`components/ui/*`)·모달 매니저·테마 토글은 유지·재사용.

## 6. 검증 기준

1. `pnpm typecheck` 통과
2. `pnpm lint` 통과
3. `pnpm build` 성공 (helpdesk/sample 제거 후 라우트 트리 재생성 포함)
4. 7개 화면 라우트 진입 가능, 각 핵심 URL(`/works`, `/works/$id/write/$sceneId`, `/works/$id/bible?entity=$id`, `/works/$id/timeline`)을 직접 입력/새로고침 시 해당 상태 복구
5. 디자인 토큰(웜페이퍼·블루·퍼플·명조 원고)이 화면에 반영
