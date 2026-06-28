# run — 엔티티 내용 편집 (카테고리 잠금)

slug: edit-entity-content · 실행일: 2026-06-26 · 워크플로우: 미사용(직접 실행)

## 실행 방식

3개 슬라이스가 한 기능 영역에 강결합(폼 추출 → 재사용)이고 슬라이스 3이 1·2에 의존해 병렬 이득이 없어, Dynamic Workflow 대신 직접 실행. eco=on이라 비용 측면에서도 타당.

## 계획대로 된 것

- **슬라이스 1** — `new-entity-screen`의 입력부를 `entity-form.tsx`(공용 `EntityForm`)로 추출. `initial`/`lockType`/`heading`/`subheading`/`submitLabel`/`onSubmit`/`onCancel` props. `new-entity-screen`은 이 폼을 쓰는 thin 컴포넌트로 리팩터링.
- **슬라이스 2** — `works.store.ts`에 `updateEntity(workId, entityId, input)` 추가. type 무시·기존 유지, 나머지 필드 교체, 빈 값은 `undefined` 처리. hanja 등 폼 밖 필드는 immer 드래프트에서 미변경 → 보존.
- **슬라이스 3** — `edit-entity-screen.tsx` + `bible.edit.tsx` 라우트(`/works/$workId/bible/edit?entity=`) + 상세 헤더 우측 "수정" 버튼. 없는 엔티티는 `<Navigate>`로 상세 리다이렉트. 카테고리 칩 대신 비활성 배지 + "카테고리는 변경할 수 없습니다".

## 계획과 다른 것 (divergence — 낮음)

- store에서 `imageUrl` 제거를 `delete entity.imageUrl`로 짰으나 biome `noDelete`에 걸려 `entity.imageUrl = input.imageUrl || undefined`로 변경. 동작 동일.
- 진입 버튼을 상세 헤더의 이미지/이름 블록과 같은 flex row에 `ml-auto`로 우측 배치(계획의 "이름/배지 옆 우측"과 동일 의도).

## 검증 (UAT — playwriter)

- 상세(`?entity=e-jwamujin`)에 "수정" 링크 표시.
- 수정 클릭 → `/bible/edit?entity=...`, h1 "엔티티 수정", 이름="좌무진" 등 기존 값 채워짐, 잠금 메시지 표시, type 칩 없음.
- 이름·요약 수정 → 저장 → 상세 복귀, h1 "좌무진(수정됨)左無塵"(한자 보존), 요약 반영.
- 회귀: `/bible/new`는 "새 엔티티" + type 칩 선택 가능 + 잠금 메시지 없음으로 그대로 동작.
- `pnpm typecheck` 통과 · `pnpm lint` 통과(124 파일).
