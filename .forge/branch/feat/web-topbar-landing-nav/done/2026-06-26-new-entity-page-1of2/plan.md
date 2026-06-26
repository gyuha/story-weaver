<!-- forge-slug: new-entity-page-1of2 -->
<!-- task: 15 -->
<!-- tdd: off -->
<!-- part: 1/2 -->
# 새 엔티티 추가 페이지 — 유형 선택 + 유형별 폼 (part 1/2)

## Goal / Non-goals
- Goal: World Bible에 **새 엔티티를 추가하는 별도 페이지**(`/works/$workId/bible/new`)를 만든다. 맨 위 유형 선택 박스(인물·장소·사건·아이템)로 고른 유형에 맞춰 입력 폼이 달라지고, 인물은 샘플 대사·주요 관계를 **반복 행으로 추가/삭제**할 수 있다. 저장하면 `addEntity`로 work.entities에 추가하고 그 엔티티 상세(`/works/$workId/bible?entity=<새 id>`)로 이동한다. `entity-list`의 기존 "새 엔티티" 버튼이 이 페이지로 연결된다.
- Non-goals: 이미지 생성(part 2/2), 참여자·소유자를 실제 엔티티 id로 연결(자유 텍스트로 둠), 엔티티 편집(수정/삭제), 폼 유효성의 정교한 검증(이름 필수 정도만), 실 API/영속화.

## Source of truth
- Glossary terms: [[엔티티 카드]], [[World Bible]] in `.forge/CONTEXT.md`
- Related ADRs: none (유형별 필드 세트는 `docs/data-model.md` 3.2를 따른다)
- Definition of Done: `/works/hoegwija/bible/new` 진입 시 유형 선택 박스 + 선택 유형의 폼이 렌더된다 — 공통(이름·이모지·별칭·요약) + 유형별(인물: 외모·성격·말투 + 샘플 대사 반복 행 + 관계 이름/역할 반복 행 / 장소: 묘사·지역·분위기 / 사건: 묘사·참여자·발생 시점 / 아이템: 묘사·소유자·속성). 이름 입력 후 저장 → 목록에 새 엔티티가 생기고 그 상세로 이동. "새 엔티티" 버튼이 이 페이지로 이동. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 유형 전환 시 폼 변화·인물 반복 행 추가/삭제·저장→상세 이동 육안 확인.

## Work slices
- [ ] S1. 라우트 + addEntity 액션 — `src/routes/works/$workId/bible/new.tsx`(requireAuth, `NewEntityScreen` 렌더). `works.store.ts`에 `addEntity(workId, input): string` — 공통 + `fields`/`sampleLines`/`relations`로 구성된 입력을 받아 새 id로 work.entities에 추가, id 반환(immer, 기존 addWork 패턴). `entity-list`의 "새 엔티티" 버튼에 `Link`/navigate로 `/works/$workId/bible/new` 연결 — 완료 기준: 라우트·액션·버튼 배선, `pnpm typecheck` 통과.
- [ ] S2. NewEntityScreen 폼 셸 + 공통/유형별 텍스트 필드 — `WorkShell`(active="bible") 안에 페이지. 맨 위 유형 select(인물/장소/사건/아이템, 기본 인물). 공통 필드(이름 필수·이모지·별칭·요약) + 유형별 텍스트/textarea 필드를 유형에 따라 스위치 렌더(장소·사건·아이템 및 인물의 외모·성격·말투). 저장 버튼(이름 비면 disabled) → 입력을 Entity로 매핑(유형별 값 → `fields[{label,value}]`, 빈 값 제외)해 `addEntity` 호출 후 상세로 navigate — 완료 기준: playwriter로 유형 전환 시 필드가 바뀌고 저장 시 엔티티 생성·상세 이동 확인. (depends: S1)
- [ ] S3. 인물 반복 에디터 — 인물 유형일 때 **샘플 대사**(텍스트 행 추가/삭제)와 **주요 관계**(이름 + 역할 두 칸 행 추가/삭제) 편집 UI. 저장 시 비지 않은 항목을 `sampleLines`/`relations`로 매핑 — 완료 기준: playwriter로 인물에서 행 추가·삭제·저장 후 상세에 반영 확인, `pnpm lint` 통과. (depends: S2)

## 비고 (eco)
- 새 의존성 0. 폼 상태는 로컬 useState. 유형별 필드 세트는 data-model 3.2 그대로(과한 추상화 없이 유형별 분기). 참여자/소유자/발생시점은 자유 텍스트(엔티티 id 연결은 비범위).
