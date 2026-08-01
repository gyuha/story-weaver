<!-- forge-slug: selection-ai-menu-unify-picker -->
<!-- task: 61 -->
# RUN — 선택 영역 AI 메뉴: 팝오버 헤더를 액션별로 + 이어쓰기와 연출 통일

실행 형태: **직접 실행(워크플로우 아님).** 변경 대상이 두 파일이고 S1→S2가 같은 두 파일을 순차로 고쳐 병렬 이득이 0이라, 서브에이전트를 띄우면 각자 같은 파일을 다시 읽는 순수 오버헤드다(`ai-chapter-title` 회고의 같은 판단을 재사용). 조건부 코드리뷰도 생략 — 삽입 로직은 손대지 않고(회귀 테스트로 고정) 표시와 `stop()` 배선만 바뀌는 저위험 변경(ADR-0007의 "trivial/low-risk는 건너뛴다" 재량).
모드: `tdd: on`(슬라이스마다 실패 테스트 선행), `eco: on`(직접 실행 경로이므로 서브에이전트 주입 없이 메인 세션이 ECO 출력 규율만 적용).

## 계획대로 된 것

- **S1 헤더 라벨 prop화** — `SuggestionPicker`가 `title`을 **기본값 없는 필수 prop**으로 받는다. `selection-ai-menu.tsx`의 `Preview`에 `title` 필드를 추가하고 `run()`에서 `AI ${action.label}`로 채운다(`ACTIONS`에 새 필드를 만들지 않고 기존 `label`에서 파생 — 플랜이 방법을 열어둔 부분).
- **S2 연출 통일** — `SuggestionPicker`의 `isStreaming ? rawText blob : parseSuggestions(...)` 3항 분기를 삭제하고 `parsePartialSuggestions(rawText, !isStreaming)` 하나로 통일. 완성 후보만 카드 + `growing`이면 `Skeleton`(모달과 같은 `h-16 w-full rounded-md`). `parseSuggestions` 직접 import가 orphan이 되어 제거(내 변경이 만든 orphan).
- **S2 닫기 시 스트림 중단** — `selection-ai-menu.tsx`의 `onCancel`과 `onApply` 양쪽에서 `assist.stop()` 호출. 적용 시점에도 스트리밍 중일 수 있어 둘 다 필요하다.
- **테스트 목에 `stop` 추가** — `selection-ai-menu.test.tsx`의 assist 목이 `{ start, ...state }`만 반환했다. `stopSpy`를 추가했다(#60 `manuscript.test.tsx`에서 같은 함정을 겪었고 이번엔 착수 전에 예고했다).
- **구 동작을 곁쇄하던 테스트 2건을 새 요구사항으로 다시 썼다**(플랜이 못박은 항목) — `selection-ai-menu.test.tsx`의 `'스트림 청크가 도착하는 대로 미리보기에 점진적으로 반영된다'`와 `suggestion-picker.test.tsx`의 `'스트리밍 중에는 원문 blob과 생성 중 라벨을 보여주고 적용 버튼은 없다'`. 둘 다 원문 노출을 단정하고 있었으므로 통과시키는 대신 요구사항을 교체했다.
- **TDD 규율** — S1은 4건(액션별 헤더), S2는 5건이 구현 전에 정확히 FAIL하는 것을 확인한 뒤 구현했다. red → green 전이 자체가 테스트 유효성의 증거이므로 별도 사보타주는 하지 않았다.
- **Non-goals 무침범** — 모달로 바꾸지 않음(팝오버 위치·크기 유지) · 공통 내용부 추출 없음 · 팝오버에 "N개 생성됨" 부제 없음 · 백엔드 무변경 · 원문↔제안 대비 UI 없음 · 늘리기 `prefix` 무변경 · `manuscript.tsx`의 이어쓰기 모달 무변경.

## 진짜 divergence — 플랜이 "확인했다"고 쓴 것을 확인하지 않았다

**플랜의 검증 노트에 이렇게 적혀 있다**: "`SuggestionPicker`의 소비자는 `selection-ai-menu.tsx` **하나**뿐이다(`manuscript.tsx`는 #60에서 갈라졌다). #60의 플랜이 이 확인을 빠뜨려 모순된 계획을 만들었으므로 이번엔 착수 전에 grep으로 확정했다."

**거짓이다.** 실제로 실행한 grep은 `selection-ai-menu.tsx`와 `manuscript.tsx` **두 파일만 대상**이었고 트리 전체를 검색하지 않았다. 세 번째 소비자가 있었다: **`web/src/features/works/components/synopsis-editor.tsx:123`** — 기획의도 AI 이어쓰기(`synopsis-intent-ai-continue`에서 만든 것). 즉 **#60에서 배운 교훈("바꿀 컴포넌트의 다른 소비자를 grep으로 확인하라")을 한 작업 뒤에 그대로 재현했고, 이번엔 확인했다고 플랜에 명시적으로 써넣기까지 했다.**

- **잡아낸 것은 타입 시스템이다.** `title`을 기본값 없는 필수 prop으로 둔 결정이 `pnpm typecheck`에서 `synopsis-editor.tsx(123,14): error TS2741`로 걸렀다. 기본값을 뒀다면 조용히 "AI 이어쓰기"가 계속 나왔을 것이고, 이 divergence는 발견되지 않은 채 넘어갔다.
- **불가피한 범위 확장**: 타입 에러를 풀려면 `synopsis-editor.tsx`를 고쳐야 하고, 그 팝오버는 공유 컴포넌트라 연출 변경을 필연적으로 물려받는다. 소비자별로 연출을 갈라놓는 것은 이번 작업이 없애려는 바로 그 패턴이므로 함께 통일했다. `title="AI 이어쓰기"`는 그 화면에선 **의미상 정확하다**(기획의도를 이어 쓰는 동작).
- 그 결과 `synopsis-editor.test.tsx`의 `'…점진적으로 렌더한다'` 1건도 같은 이유로 다시 썼다(계획에 없던 세 번째 테스트 재작성).
- **남은 구멍(고치지 않음)**: `synopsis-editor`의 취소는 여전히 스트림을 끊지 않는다. 그 화면은 `useAssistStream`이 아니라 **다른 훅 `useSynopsisContinueStream`**(`features/works/api/synopsis-continue.api`)을 쓰고, 그 훅에 abort가 노출돼 있는지부터 확인해야 하므로 이번 플랜의 범위를 확실히 넘는다. 후속으로 남긴다.

## 최종 게이트 (직접 재실행)

- `pnpm typecheck` → clean (1차 실행에서 위 TS2741을 잡아냈고, 수정 후 clean)
- `pnpm lint` → clean (218 files)
- `pnpm test` → **47 files / 274 tests passed** (기존 266 + 신규 8)
- 소비자 전수 확인(이번엔 트리 전체): 운영 소비자 2곳 — `selection-ai-menu.tsx:94`, `synopsis-editor.tsx:123`

## 막혔던 곳 / 환경 이슈

- `pnpm`을 저장소 루트에서 실행해 `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`를 두 번 맞았다. `web/`에서 실행해야 한다(세션 cwd가 이전 명령의 `cd`에 따라 흔들린다).
- **커밋하지 않았다.** 이 작업 외에 #60의 코드·`.forge/CONTEXT.md`·`admin-shell.tsx`·`.forge/done/` 아카이브·`.forge/quick/LOG.md`가 여전히 미커밋 상태로 섞여 있다.

## 후속 작업 후보 (다음 fg-ask)

- **`synopsis-editor`의 취소도 스트림을 끊게 하기** — `useSynopsisContinueStream`에 abort 노출이 필요한지 확인부터. 지금은 기획의도 이어쓰기를 취소해도 토큰이 계속 나간다.
- **`SuggestionPicker` 소비자가 2곳으로 늘었으니 공통 내용부 추출을 재고할 것** — 이번엔 사용자 선택으로 미뤘으나, 소비자가 셋(팝오버 2 + 모달 1)이 된 지금 연출이 다시 어긋날 표면이 넓어졌다.
- **한글 IME Enter 가드 전수 적용** — 4곳, `memory-panel.tsx:647` 최우선. 네 사이클 미착수.
- **pre-commit mypy 훅 복구**(`files: ^src/` → `^api/src/`) · **`CLAUDE.md` 두 곳 갱신** — 둘 다 `fg-quick` 감.
