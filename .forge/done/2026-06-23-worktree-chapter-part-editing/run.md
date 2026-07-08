# run.md — 좌측 작업트리에 화 추가·부 추가·부 이름변경

실행일: 2026-06-23 · 슬러그: worktree-chapter-part-editing · task #6
규모가 작아 Dynamic Workflow 대신 단일 세션에서 직접 실행(fg-run 비용추정 원칙).

## 계획대로 된 것
- **S1** `works.store.ts`에 액션 3종 추가: `addChapter(workId, partLabel)`(index=작품 내 max+1, 빈 씬 1개), `addPart(workId)`("제N부" 자동 라벨 → addChapter 호출, 라벨 반환), `renamePart(workId, oldLabel, newLabel)`(매칭 화 partLabel 일괄 교체). `pnpm typecheck` 통과.
- **S2** `work-tree.tsx`: 각 부 끝 `+ 새 화`, 트리 맨 아래 `+ 새 부`, 부/화 인라인 편집(`InlineEdit` — Enter/blur 커밋, Escape 취소). 새 화 추가 시 해당 부 자동 펼침 + 제목 편집 포커스. `pnpm lint` 통과.
- **S3** `docs/data-model.md` 사용자 대면 "에피소드" → "부" 전부 교정, DB/코드 식별자 `episodes`/`episode_id` 유지 근거 한 줄 주석 추가. 잔여 "에피소드" 0건(grep 확인).
- playwriter 육안 검증: 새 화(8화)·새 부(제3부+9화)·부 이름변경(제2부→"제2부 혈산문 대전", 소속 화 유지) 모두 트리 즉시 반영.

## 계획과 달랐던 것 (분기 — 낮음)
- **타입 순환 회피**: `addPart`가 다른 액션을 호출해야 해 `immer((set, get) => ...)`로 `get`을 받아 `get().addChapter(...)` 호출. 계획엔 없던 즉석 결정(자기참조 `useWorksStore.getState()`는 타입 순환 에러 유발).
- **화 더블클릭 편집 추가**: 계획은 "새 화 추가 시 포커스"만 명시했으나, `InlineEdit`를 재사용해 기존 화/부 모두 더블클릭으로 이름변경 가능하게 함(같은 컴포넌트라 추가 비용 없음, 응집적).
- **사소한 스타일**: 트리 컨테이너 `pb-2`, 새 부 버튼 `mt-0.5` 추가(여백).

## Non-goals 준수
- 화 이동·드래그 순서변경·삭제·실 API·Part 엔티티화 모두 손대지 않음.

## ponytail 천장 (코드 주석으로 명시함)
- `addPart`에 `// ponytail:` 주석 — partLabel 문자열 모델이라 "제N부" 라벨 충돌 시 트리 병합됨. mock 단계 수용.

## 코드 리뷰
- mock 스토어 + 사이드바 컴포넌트 + 문서 변경. auth/데이터변형/API/마이그레이션 무관, 저위험 → 별도 리뷰 페이즈 생략(trivial 제외 기준).
