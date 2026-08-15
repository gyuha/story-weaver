# RUN — 버전 비교 페이지 (2/2): 진입 전환과 모달·선저장 기계장치 철거

slug: version-diff-page-2of2 · task 75 · part 2/2 · tdd: on
실행: 2026-08-12 · 직접 실행(워크플로우 없음 — 슬라이스 3개가 완전히 직렬이라 병렬 이득이 0)

## 슬라이스별 결과

- S1 칩 → 페이지 이동(저장을 보장하며) — ✅ 계획대로
- S2 페이지의 되돌리기 — ✅ 계획대로
- S3 철거 — ✅ 계획대로

## 계획대로 된 것

- **계획의 실측 위치가 전부 정확했다.** 착수 시 `grep -n "showHistory\|setShowHistory\|restoringRef\|restoreVersion\|initialBodyRef\|VersionHistoryModal"`를 다시 돌려 계획서에 적힌 행번호(58·96·124·260·330·332·360·383-428·498·699-706)와 일치함을 확인했다. 그릴링 단계의 선실측이 그대로 값을 했다.
- **DoD 4항목 중 코드로 확인 가능한 것 전부 충족**: 칩이 모달이 아니라 `/works/$workId/versions/$chapterId`로 이동하고, 미저장분이 있으면 이동 전 저장하며, 저장 실패 시 이동하지 않고 에러 토스트가 뜨고, 페이지의 `이 버전으로 되돌리기`가 원고를 바꿔 집필 화면으로 복귀하며, `version-history-modal.tsx`·`word-diff.ts`·선저장 기계장치가 저장소에서 사라졌다.
- 게이트: `pnpm typecheck` 클린 · `pnpm lint` 클린(biome, 자동 정렬 3파일 적용 후) · `pnpm test` **54 files / 370 passed**.
- **철거 잔존 참조 0건**: `grep -rn "VersionHistoryModal\|word-diff\|diffWords\|restoringRef\|restoreVersion" src/` → 0건.
- **`version-time.ts`는 남겼다**(계획대로 — 1of2의 페이지가 계속 쓴다). `initialBodyRef`도 남겼다 — S1이 그것을 재사용한다.

## 방어를 깨뜨려 red를 확인한 것

계획이 "확인 필요"로 남긴 항목을 **실측으로 닫았다.** 두 건 모두 방어를 제거해 실제로 red가 되는 것을 관측했다.

1. **S1 ④ — 이동 시 언마운트 정리가 조용해지는가.** `openVersions`에서 `initialBodyRef.current = currentText` 한 줄을 제거하고 재실행 → `완성 기준 ④` 테스트가 red(`1 failed | 49 passed`). 즉 그 갱신이 없으면 언마운트 정리가 **같은 본문을 두 번째로 PATCH**해 버전이 둘 쌓인다. **계획이 경계한 대로 "방어 장치가 있다"와 "새 경로에서 그것이 발동한다"는 다른 명제였고, 후자를 실제로 확인했다.**
   그리고 이 테스트가 보는 명제는 `initialBodyRef`의 값이 아니라 **`mockUpdateChapter` 호출 횟수(총 1회)** 다 — 계획이 `#71`의 `zIndex` 함정으로 경계한 "red는 나지만 다른 명제를 보는" 실수를 피했다.
2. **S2 ④ — 재진입 가드.** 버튼의 `disabled`에서 `reverting ||`를 제거하고 재실행 → `완성 기준 ④` 테스트가 red(`1 failed | 3 passed`). 그리고 이 테스트는 `deferred`로 PATCH를 **in-flight 상태에 붙잡아 두고** 두 번째 클릭을 시도한다 — `mockResolvedValue`만 쓰는 목으로는 이 명제를 볼 수 없다(회고가 네 번 지적한 "목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다").

계획의 나머지 "확인 필요" 두 건:

3. **word-diff 고아 여부** — `grep -rn "word-diff\|diffWords" src/` 결과 사용처가 `version-history-modal.tsx`와 그 테스트뿐임을 확인한 **뒤에** 삭제했다(근거 없이 지우지 않았다).
4. **되돌리기 후 복귀 시 집필 화면이 새 본문을 보는가** — `navigate` 전에 `setChapterParagraphs(workId, chapter.id, toParagraphs(leftBody))`로 스토어를 갱신하고, S2 ①이 그 호출을 인자까지 단정한다. 다만 **"옛 본문이 잠깐 보이는지"는 페인팅 문제라 jsdom이 관측할 수 없다** — 브라우저 UAT의 몫으로 남긴다.

## 발산

1. **테스트 순감 9건 — 전부 의도한 것이며 파일별로 실측해 맞췄다.** 계획이 "지운 뒤 남은 테스트 수를 기록해 의도한 만큼만 줄었는지 확인"하라고 요구했으므로 `git stash`로 기준선을 재현해 측정했다: 저장소 전체 **379 → 370(-9)**. 내역 — `manuscript.test.tsx` 53 → 50(구식 describe 2개의 `it` 7건 제거, S1 신규 4건 추가 = -3) · `version-history-modal.test.tsx` 10 → 0(파일 삭제) · `versions-page.test.tsx` 0 → 4(신규). `-3 -10 +4 = -9`로 정확히 정합한다. **일괄 치환·일괄 삭제는 쓰지 않았다** — 제거 대상 describe의 시작 행을 확인하고 그 지점부터만 잘랐다(계획의 경계 사항).
2. **`manuscript.test.tsx`의 목 세 덩어리가 내 변경으로 고아가 돼 함께 제거했다** — `VersionHistoryModal` 목, `capturedVersionModalProps`와 그 `beforeEach` 초기화, `manuscriptQueries`/`useQueryClient`(`mockInvalidateQueries`) 목, `deferred` 헬퍼. `manuscript.tsx`가 더는 `queryClient`·`manuscriptQueries`를 쓰지 않으므로 그 목들은 아무것도 검증하지 않는 상태가 됐다. **내 변경이 만든 고아만 정리했고 무관한 코드는 건드리지 않았다.**
3. **`manuscript.tsx`에서 `useQueryClient`·`manuscriptQueries` import가 고아가 돼 제거했다** — `restoreVersion`만 쓰던 것이다. 그리고 251행 주석이 사라진 `restoreVersion`을 가리키고 있어 문구를 고쳤다(계획이 지목한 260행 주석 — 앞선 삭제로 행이 밀렸다).
4. **되돌리기 버튼을 헤더 우측에 뒀다.** 계획은 "페이지 상단"만 지정했고 정확한 위치는 UAT에서 바뀔 수 있는 지점으로 남겨 뒀다(계획의 재발 위험 ④-①). 보조 문구 `현재 본문은 새 버전으로 보존됩니다`를 버튼 왼쪽에 붙였고, `Undo2` 아이콘을 썼다.
5. **성공 토스트를 페이지에서 띄우고 이동한다**(계획의 UAT 변동 지점 ④-②의 두 선택 중 후자). `sonner`는 라우트 이동에도 살아남으므로 집필 화면에 도착한 뒤에도 보인다.
6. **`versions-page.test.tsx`를 새로 만들었다** — 이 페이지에 테스트 파일이 없었다(1of2가 남기지 않았다). `VersionsView`는 export되지 않아 `VersionsPage`를 통해 렌더하며, 그를 위해 `useParams`·`useWork`/`findChapter`·`useWorkChapters`·`ReactDiffViewer`를 목했다. diff 렌더링 자체는 1of2의 관심사라 가볍게 세웠다.
7. **`revert`의 실패 경로에서 `setReverting(false)`를 명시적으로 되돌린다.** `finally`를 쓰지 않았다 — 성공 시에는 페이지를 떠나므로 상태를 되돌릴 필요가 없고, `finally`로 되돌리면 이동 직전에 버튼이 잠깐 다시 활성화된다.

## 남은 것 — 브라우저 UAT

DoD의 마지막 항목("브라우저로 육안 확인")과 jsdom이 관측할 수 없는 것들이 남아 있다:
- 되돌리기 후 복귀했을 때 **옛 본문이 잠깐 보이는지**(페인팅·타이밍 — 위 3번).
- 진입 시 저장이 느릴 때(대용량 화) **이동이 지연되는 체감** — 진행 표시가 필요한지(계획의 UAT 변동 지점 ④-③).
- 되돌리기 버튼의 위치·문구가 실제 화면에서 적절한지(위 발산 4·5).
- 1of2가 남긴 "현재 = 최신 버전" 전제가 실제로 닫혔는지(S1이 진입 시 저장을 보장하므로 페이지 도착 시점에 최신 버전 == 현재 본문이어야 한다).

## 후속 작업 후보

- **ADR `260805-214733` 개정 검토** — 그 ADR의 "미저장분 자동 선저장" Consequence는 이번 작업으로 **무효**가 됐다(페이지 이동이 그 역할을 대신한다). 계획이 fg-learn에서 개정 또는 후속 ADR을 검토하라고 명시했다.
