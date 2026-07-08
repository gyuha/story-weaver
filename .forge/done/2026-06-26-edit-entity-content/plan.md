<!-- forge-slug: edit-entity-content --><!-- task: 17 --><!-- tdd: off -->

# 엔티티 내용 편집 (카테고리는 잠금)

## Goal

World Bible 엔티티 상세 화면(`/works/$workId/bible?entity=<id>`)에서 "수정" 버튼으로 전용 편집 화면에 진입해 엔티티 내용을 고칠 수 있게 한다. 카테고리(type)는 한번 정해지면 변경 불가.

작성 폼(`new-entity-screen`)과 편집 폼은 입력 UI가 거의 같으므로 공용 `EntityForm`으로 추출해 양쪽이 공유한다.

## Non-goals (이번에 안 함)

- 엔티티 삭제 — 별개 작업
- 카테고리(type) 변경/마이그레이션 — 영구 잠금
- 상세 화면 인라인 편집 — 전용 편집 화면 방식으로 결정
- 실 API 연동 — 기존 mock-store 패턴 유지

## Source of truth (glossary)

- **엔티티 카드 (Entity Card)** — World Bible 안의 한 항목(인물·장소·사건·아이템). 정해진 필드를 가진다. (`.forge/CONTEXT.md`)
- **World Bible** — 한 작품의 설정 저장소. (`.forge/CONTEXT.md`)
- type별 필드 구성은 `docs/data-model.md` 3.2 / `new-entity-screen.tsx`의 `TYPE_FIELDS` 기준.

## Decisions

- **카테고리 잠금의 근거**: type이 바뀌면 type별 필드(`TYPE_FIELDS`)가 통째로 달라져 기존 입력이 무효화된다. 따라서 편집에서 type 변경을 막는다. (UI/제품 결정 — 가역적이라 ADR 미작성)
- **편집 진입은 전용 화면 + 검색 파라미터**: 기존 상세가 쓰는 `?entity=<id>` 패턴과 일관성 유지(경로 파라미터 대신). (가역적 — ADR 미작성)

## Slices

### 1. 공용 `EntityForm` 컴포넌트 추출

`new-entity-screen.tsx`의 입력부(이름·한자·이모지 피커·별칭·요약·type별 필드·샘플 대사·관계·이미지 생성)를 `entity-form.tsx`로 추출한다.

- props: `초기값(Entity 일부) · 저장 콜백 · type 잠금 여부(lockType) · 제목/저장 버튼 라벨`.
- `new-entity-screen`을 이 폼을 쓰도록 리팩터링.
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과. 기존 새 엔티티 작성 화면(`/bible/new`)이 playwriter로 이전과 동일하게 동작(필드 입력·이모지 피커·이미지 생성·저장 → 상세 이동).

### 2. 스토어 `updateEntity` 추가

`works.store.ts`에 `updateEntity(workId, entityId, input)` 추가.

- `addEntity`와 같은 입력 형태를 받되 **type은 무시하고 기존 type 유지**.
- 편집 가능한 필드를 통째로 교체. 빈 값은 `addEntity`와 동일하게 `undefined` 처리(별칭/이미지/샘플대사/관계 비우면 제거).
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과.

### 3. 편집 화면 + 라우트 + 진입 버튼

- `edit-entity-screen.tsx`: `EntityForm`을 기존 엔티티 값으로 채우고 `lockType` 켠 뒤 저장 시 `updateEntity` 호출. 저장 후 상세(`/bible?entity=<id>`)로 복귀 + 토스트 `'<이름>' 엔티티를 수정했습니다`.
- 라우트 `bible.edit.tsx` → `/works/$workId/bible/edit?entity=<id>` (`validateSearch`로 `entity` 파싱). `entity` 누락/없는 id면 상세로 리다이렉트.
- `entity-detail.tsx` 상단(이름/카테고리 배지 옆 우측)에 "수정" 버튼 → 편집 라우트로 이동.
- 폼 안 카테고리 표시: 현재 카테고리 1개만 비활성 배지로 + 보조문구 `카테고리는 변경할 수 없습니다`.
- **완료 기준**: `pnpm typecheck`·`pnpm lint` 통과. playwriter로 `?entity=e-jwamujin` 상세 → 수정 → 값 변경(이름/요약/필드) → 저장 → 상세에 반영 + 토스트 확인, 그리고 편집 폼에서 카테고리가 잠겨 변경 불가임을 확인.
