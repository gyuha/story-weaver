<!-- forge-slug: chapter-summary-2of2 -->
<!-- task: 68 -->
# RUN — 화 요약 (2/2) 요약 버튼 배선과 검토 화면 한눈에 보기

실행 형태: **직접 실행(워크플로우 아님).** web 7파일에 순차 의존이 있어 병렬 이득이 없다.
모드: `tdd: on`, `eco: on`. `Run all` 배치의 2/2번째(#67 → #68). 마지막 파트.

## 슬라이스 결과

- S1 SDK 재생성 + `Chapter.summary` 타입·hydrate 배선 — ✅ 계획대로
- S2 `요약` 칩 → 모달 → 적용 저장 — ⚠ 스토어 액션 `saveChapterSummary`를 새로 만들어야 했다(계획은 "PATCH로 저장"까지만 적었다)
- S3 검토 화면 화별 요약 섹션 — ✅ 계획대로

## 계획대로 된 것

- **TDD 규율을 지켰다.** S1은 `summary` undefined, S2는 스토어 액션 부재(`is not a function`)와 칩 미배선 4건, S3는 섹션 부재 4건으로 각각 red를 먼저 봤다.
- **계약 갱신을 순서대로 밟았다** — `uv run python scripts/export_openapi.py`로 `docs/openapi.json` 갱신 → `assist/summary` 경로와 `ChapterResponse.summary`·`ChapterUpdate.summary` 생성 확인 → `pnpm generate`(5 files) → `src/api/`는 손대지 않았다.
- **계획이 지목한 가장 그럴듯한 사고를 막았다** — `saveChapterSummary`가 `body`를 함께 싣지 않는지 스토어 테스트로 단정했고(`body: { summary }`만), `manuscript` 테스트에서도 `mockUpdateChapter`가 호출되지 않음을 단정했다. 실었다면 part 1/2 S2가 아낀 재임베딩이 요약마다 되살아나고 화면상으로는 멀쩡해 보인다.
  - **그 방어가 실재하는지 직접 확인했다** — `saveChapterSummary`가 `body`를 함께 싣도록 임시 변경하니 스토어 테스트가 red(1 failed / 43 passed), 복원 후 13 passed.
- **모달을 재사용했다** — `ContinueSuggestionModal`에 `title="AI 요약"`. 요약은 단일 텍스트지만 파서 폴백이 카드 1장으로 렌더한다(`style` 태스크와 동일). 새 컴포넌트를 만들지 않았다.
- **배치를 그릴링 결정대로 넣었다** — 충돌 뒤·상태 테이블 앞. DOM 순서를 테스트로 고정했다(문자열 위치 비교).
- **비목표 무침범** — 백엔드 무변경 · 요약 자동 생성 없음 · 검토 화면에서 요약 편집·삭제 없음 · 요약 카드에서 화로 이동하는 링크 없음 · 일괄 요약 없음 · 요약 이력 없음 · `reviewSummary` 통계 3개 유지 · 새 ADR 없음.

## 계획과 달라진 것 (divergence)

1. **스토어 액션을 새로 만들어야 했다.** 계획 S2는 "`PATCH chapters/{id}`로 `{ summary }`를 저장하고 스토어를 갱신한다"까지만 적었는데, 그 일을 할 자리가 없었다 — `renameChapter`를 선례로 `saveChapterSummary(workId, chapterId, summary)`를 추가했다(PATCH + 스토어 반영 + 실패 시 스토어 무변경). 계획이 "스토어에 액션이 필요하다"를 명시하지 않았다.
2. **`AssistTaskType`에 `summary`를 넣어야 했고, 그걸 테스트가 못 잡았다.** `pnpm test`는 315건 전부 통과했지만 `pnpm typecheck`가 `Argument of type '"summary"' is not assignable to parameter of type 'AssistTaskType'`로 잡았다 — 테스트의 assist 목업이 타입을 우회하기 때문이다. `AssistTaskType` 유니온 + `AssistPayloadMap` + `SummaryRequest` import 3곳을 고쳤다. **계획이 이 파일을 언급하지 않았다.**
3. **내가 쓴 테스트에 미사용 헬퍼가 남아 typecheck가 막혔다** — `manuscript.test.tsx`의 `edit` 헬퍼를 복사해 넣고 쓰지 않았다(`TS6133`). 제거.
4. **곁들여: 내가 앞선 작업(#—, 새 부 이동)에서 남긴 중복 doc 주석을 정리했다** — `works.store.ts`의 `addPart` 위에 옛 주석("새 부 라벨을 반환")과 새 주석이 겹쳐 있었고, 옛 것이 이제 틀린 설명이었다. 내 잔여물이라 치웠다.

## 최종 게이트 (직접 재실행)

- web `pnpm typecheck` clean · `pnpm lint` clean(220 files) · `pnpm test` → **49 files / 315 tests passed**(#66 시점 303 + 신규 12: S1 2 · 스토어 2 · S2 4 · S3 4)
- 계약: `docs/openapi.json`에 `assist/summary` 경로와 `summary` 필드 존재 확인, `pnpm generate` 산출물 5파일만 변경.
- api는 이 파트에서 건드리지 않았다(part 1/2의 949 passed가 유효).

## 막혔던 곳 / 환경 이슈

- 없음. typecheck가 divergence 2·3을 즉시 잡았다 — **테스트만 믿었다면 `summary` 태스크 타입 누락이 런타임까지 갔을 것이다.**
- **미커밋** — 이 파트의 web 변경 + `docs/openapi.json` + `src/api/` 생성물. part 1/2의 api 변경도 함께 미커밋. `.forge/codebase/` 7파일은 이전 세션의 fg-map 재생성분으로 여전히 남아 있다.

## 후속 작업 후보

- **요약 카드에서 해당 화로 이동** — 이번 비목표. 충돌 callout의 "이동"도 아직 목업(`timeline-screen.tsx:43`)이라 함께 실배선하는 게 낫다.
- **`reviewSummary`에 "요약된 화 수"** — 비목표로 뺐지만 "빈 곳이 몇 개인가"를 통계로 보여주면 유용하다.
- **`AssistTaskType`이 백엔드 `TaskType`과 수동 동기화된다** — assist 태스크를 추가할 때마다 두 곳을 손으로 맞춰야 하고, 테스트는 목업 때문에 못 잡는다. 생성 타입에서 파생시킬 여지가 있다.
- **`Makefile` 참조 테스트 12건** — 다섯 사이클 연속 미룸.
