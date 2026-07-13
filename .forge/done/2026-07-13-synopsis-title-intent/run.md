<!-- forge-slug: synopsis-title-intent -->
# run — 시놉시스 화면 재구성 (2026-07-13)

직접 실행(단일 세션, eco 모드 — Workflow 생략, 프런트 전용 소규모 작업이라 fg-run 자체 비용 판단으로 직접 처리). TDD on.

## 계획대로 된 것

- **S1** — `works.store.ts`에 `renameWork(workId, title)` 액션 추가(`worksApi.update` 호출, `renameChapter` 패턴 그대로 미러링). TDD 테스트 2건(성공 시 반영/실패 시 유지).
- **S2** — `synopsis-editor.tsx` 신규 컴포넌트: 제목 인라인 편집(blur/Enter 커밋 → `renameWork`) + 기획의도 텍스트 영역(마운트 시 `manuscriptQueries.synopsis` 조회, blur 커밋 → `manuscriptMutations.updateSynopsis`), 저장 시 짧은 "저장됨" 표시. `synopsis.tsx` 라우트에서 기존 자리표시자 텍스트·`BeatSheetPanel` 제거하고 이 컴포넌트로 교체. TDD 테스트 4건.
- **S3** — `work-shell.tsx`의 `NavItem` 순서를 "시놉시스 → World Bible → 검토·타임라인"으로 변경. TDD 테스트 1건(DOM 순서).
- **S4** — `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 통과(42 files, 193 tests). 백엔드는 기존 엔드포인트(`PATCH /works/{work_id}`, `GET/PUT /works/{work_id}/synopsis`) 그대로 재사용 — 변경 없음. 두 엔드포인트 모두 기존 백엔드 테스트(`test_synopsis_route.py`)로 이미 검증돼 있음(404-when-none-yet 동작 확인).

## 차이(divergences)

1. **계획에 없던 그릴링 중 전면 방향 전환** — 이 작업 직전에 "시놉시스 = 카드 컬렉션(드래그 앤 드롭)" 계획을 세우고 ADR-0011까지 썼으나, 같은 세션에서 사용자가 범위를 재정의(줄거리는 검토-타임라인으로, 시놉시스는 제목+기획의도로 축소)해 ADR-0011을 폐기(`retired/`)하고 이 계획으로 다시 그릴링함. 이번 run은 재그릴링 이후의 최종 계획만 반영.
2. **백엔드 작업이 계획보다도 더 적었음** — 그릴링 시점에 이미 `PATCH /works/{work_id}`(제목)와 `GET/PUT /works/{work_id}/synopsis`(기획의도) 둘 다 실 엔드포인트+프런트 SDK 래퍼가 존재함을 확인했고, 계획 자체가 "새 스키마 없음"을 전제로 작성됨 — 실행 중 추가로 발견된 차이는 없음.
3. **`SynopsisEditor`를 독립 리프 컴포넌트로 분리**(계획엔 "화면 재구성"이라고만 돼 있었음) — `WorkShell`/라우터 의존성 없이 테스트하기 위해 `MemoryPanel`·`ChatTab`과 동일한 격리 패턴을 따름(QueryClientProvider만 감싸면 렌더 가능).
4. **기획의도 조회 404를 조용히 빈 값으로 처리** — 별도 에러 배너 없이 빈 텍스트 영역으로 시작(신규 작품에서 흔한 정상 상태이므로).
5. **핸드오프 직후 실사용 피드백으로 기획의도에 명시적 "저장" 버튼 추가** — 원래 계획은 "blur 시 자동 저장"만이었으나, 사용자가 실제로 써보니 저장 방법이 안 보인다는 피드백을 줌. 원인: 원고 씬 본문은 이 앱에서 이미 명시적 "저장" 버튼 관례(`manuscript.tsx`의 `ActionChip`)를 쓰는데, 여러 줄 기획의도도 그 사용자 기대에 더 가까웠음(한 줄짜리 챕터 제목의 blur-commit 관례와는 다름). 처음엔 blur 저장 + 버튼 저장을 같이 뒀었음.
6. **이어서 "취소" 버튼 요청 → blur 자동 저장을 완전히 제거**로 재조정 — blur 자동 저장을 남겨둔 채 취소 버튼을 추가하면, 취소 버튼을 클릭하는 행위 자체가 먼저 textarea의 blur를 발생시켜(포커스 이동) 자동 저장이 먼저 실행돼버려 취소가 무의미해지는 구조적 모순이 있었음. 기획의도는 이제 "저장"/"취소" 버튼으로만 확정하는 명시적 편집으로 확정(제목은 여전히 blur-commit 유지, 별개 필드). "취소"는 마지막 저장 성공 값(`savedIntent`)으로 되돌리고, 되돌릴 게 없으면(현재값=마지막 저장값) 비활성화. 테스트 3건 추가·수정(총 6건), 195 tests 통과.

## 후속 후보

- 줄거리(기승전결) 관리 기능 — 검토·타임라인 화면 확장, 별도 과제.
- `BeatSheetPanel`/`POST /works/{work_id}/beat-sheet`는 이번에 화면에서만 빠졌고 코드는 남아 있음 — 줄거리 기능을 만들 때 재사용 여부 검토.
