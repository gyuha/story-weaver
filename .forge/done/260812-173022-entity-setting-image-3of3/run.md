# RUN — 설정 이미지 (3/3): 웹 배선 — 템플릿 썸네일 선택 · SSE 진행 · 대표 이미지와 시각 묘사

slug: entity-setting-image-3of3 · task 79 아님(task 78) · part 3/3 · tdd: on
실행: 2026-08-12 · Dynamic Workflow(에이전트 2개, `web-feature-builder`, eco→sonnet) + 직접 실행(S1 선행 완료·통합 정리·검증)

## 슬라이스별 결과

- S1 `pnpm generate` + 타입 배선 — ✅ **task 79에서 이미 완료**(그 작업이 계약을 만들고 SDK까지 재생성했다)
- S2 이미지 섹션을 신규 폼에서 걷어내고 카드 상세로 옮기기 — ✅ 계획대로
- S3 템플릿 썸네일 그리드 — ✅ 계획대로
- S4 SSE 진행·취소 배선 — ✅ 계획대로
- S5 대표 이미지 + 썸네일 스트립 + 대표 지정 — ⚠ **부분 미충족** — 좌측 목록(18×18)의 대표 이미지 반영은 못 했다(아래 발산 1)
- S6 시각 묘사 표시·편집 — ✅ 계획대로
- S7 검증 — ⚠ 코드 게이트는 전부 통과, 브라우저 UAT 8단계는 미완(아래 "남은 것")

## 계획대로 된 것

- **목업이 저장소에서 사라졌다**: `grep -rn "makePlaceholder\|escapeXml" src/features/world-bible/` → **0건**. 로컬 전용 `imageUrl` 병합(`works.store.ts`의 보존 로직 두 곳)과 `NewEntityInput.imageUrl`도 함께 걷혔다.
- **그릴링에서 fg-visual로 확정한 UI 형태를 그대로 구현했다** — 템플릿은 샘플 썸네일 그리드(드롭다운·칩 아님), 카드 상세는 대표 크게 + 이력 썸네일 스트립(균일 그리드·접힌 서랍 아님).
- **신규 폼에 이미지 UI가 없다** — `entity_images.entity_id`가 FK이므로 카드가 저장되기 전에는 이미지를 만들 수 없다. 생성은 카드 상세에서만 한다.
- **한글 IME 함정을 구조적으로 회피했다** — 묘사 편집을 Enter/Backspace 커밋이 아니라 별도 저장 버튼으로 만들었다. `new-work-creation-wizard` 회고가 "RTL `userEvent.type`은 composition 이벤트를 만들지 않고 Playwright도 IME를 우회한다 → 이 결함은 자동 테스트에 보이지 않는다"고 기록한 그 함정을 애초에 발생시키지 않는 설계다.
- **샘플 5개가 404인 것을 고려했다** — 쿼터 소진으로 미생성된 `photo-event`·`ink-item`·`webtoon-item`·`oil-item`·`photo-item`에 대해 `onError`로 대체 표시를 넣어 깨진 이미지 아이콘이 노출되지 않는다.
- **429를 시스템 오류가 아니라 안내로 표시한다** — 백엔드(task 77 S2)가 게이트웨이의 한도 메시지를 정직하게 매핑해 뒀고, 웹이 그것을 `role="alert"` 안내로 받는다.
- 게이트: `pnpm typecheck` 클린 · `pnpm lint` 클린(biome 235파일) · `pnpm test` **55 files / 380 passed**(#75 시점 370 → +10 = 신규 `entity-image-section.test.tsx` 10건과 정확히 일치).

## 방어를 깨뜨려 red를 확인한 것

S3~S6 에이전트가 6건, S2 에이전트가 1건을 보고했다. 그대로 옮긴다:

- `entityId`를 `useEffect` deps에서 빼면 **유형 전환 시 선택 초기화** 테스트 red — `new-work-creation-wizard` 회고가 "동일 장르 재클릭 시 프리셋이 조용히 초기화"로 겪은 유형의 결함을 이 전이 테스트가 막는다.
- `isQuotaNotice`를 false로 고정하면 **429 안내** 테스트 red.
- 취소 버튼 `onClick`을 no-op으로 바꾸면 **취소** 테스트 timeout(생성 중 타일이 사라지지 않음).
- `img` `onError` 핸들러를 비우면 **깨진 썸네일 대체** 테스트 timeout.
- `setPrimaryMutation.mutate` 호출을 지우면 **`isPrimary` PATCH** 테스트가 호출 0회로 red.
- 템플릿 조회를 하드코딩된 `'location'`으로 바꾸면 **유형별 템플릿** 테스트 red.
- (S2) `setWorkEntities` 테스트에서 `imageUrl` 보존 기대값만 제거하고 구현을 건드리기 전에 돌리면 red → 보존 로직 두 곳을 제거하니 green.

**그리고 취소 테스트가 목의 부작용을 실제로 재현한다** — 에이전트가 `streamGenerateEntityImage` 목을 `AbortSignal`의 `abort` 이벤트를 구독해 Promise를 reject하도록 만들어, 진짜 `useGenerateEntityImage`의 `catch`/`finally`(AbortError → `isGenerating=false`)가 실행되게 했다. `vi.fn()` 스파이가 아니다. `summary-draft` 회고가 "목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다 — 이 저장소의 네 번째 사고 유형"으로 기록한 그 함정을 정면으로 피했다.

## 발산

1. **S5의 "좌측 목록(18×18)에도 즉시 반영"을 충족하지 못했다 — 그리고 그것이 #78의 비목표에 걸린다.** `entity-list.tsx`는 엔티티를 `.map()`으로 렌더하므로 행마다 `useEntityImages`를 부르면 **행 수만큼 요청이 나간다**(사이드바에 10~50개면 그만큼). 한 번에 받는 **카드별 대표 이미지 벌크 엔드포인트가 백엔드에 없고**, 그것을 만드는 것은 이 작업의 비목표("백엔드 변경 일체")다. 그래서:
   - `entity-list.tsx`의 `entity.imageUrl` 분기를 **제거하고 이모지만 쓰게 했다**. 남겨두면 S2가 로컬 병합을 걷어낸 뒤로 **절대 참이 되지 않는 죽은 분기**가 되어, 읽는 사람이 "목록에 썸네일이 나온다"고 오해한다 — 있는 척하는 코드를 남기는 것보다 지우는 편이 정직하다. 이유와 복구 경로(`벌크 엔드포인트가 생기면 여기 썸네일을 붙인다`)를 `eco:` 주석으로 남겼다.
   - 같은 이유로 `entity-detail.tsx:14`의 `: entity.imageUrl` 폴백도 `: null`로 바꿨다(항상 `undefined`가 되는 폴백이었다).
   - 그래서 **`Entity.imageUrl` 타입 필드가 아무도 채우지 않고 아무도 읽지 않는 상태**가 되어 제거했고, `works.store.entities.test.ts`의 시드 값과 테스트 문구를 그에 맞게 갱신했다(보존 대상은 이제 `emoji`·`relations` 둘). **내 변경이 만든 고아만 정리했다.**
   - **이것은 task 79와 같은 형태의 발견이다** — 계약이 부족해 3/3이 계획대로 못 가는 지점. 다만 79와 달리 이번엔 우회(이모지)로 기능이 성립하므로 별도 작업을 만들지 않고 후속 후보로 남긴다.
2. **S1이 이미 완료된 상태로 시작했다.** task 79가 계약(목록·PATCH 엔드포인트)을 만들면서 `export_openapi.py` + `pnpm generate`까지 돌렸으므로 이 작업은 S2부터 시작했다.
3. **`apiImageSrc()`를 추가했다**(계획에 없음). 백엔드가 돌려주는 `imageUrl`·`sampleUrl`이 host 없는 절대경로(`/api/v1/...`)라, 그대로 `<img src>`에 넣으면 `VITE_API_BASE_URL`로 API 오리진을 주입하는 prod에서 이미지가 깨진다. 한 줄 헬퍼로 막았다 — **계획에 없었지만 안 하면 운영에서 실제로 깨지는 버그**다.
4. **컴포넌트를 단일 파일(`entity-image-section.tsx`)로 유지했다** — eco 원칙(파일 수 최소). API facade(`entity-images.api.ts`)와 훅 둘(`use-entity-images.ts`·`use-generate-entity-image.ts`)만 분리했다.
5. **S2가 `NewEntityInput.imageUrl`까지 제거했다**(참조가 두 곳뿐임을 확인 후). `Entity.imageUrl`은 지시대로 남겼고, 위 1번에서 통합 단계에 내가 제거했다 — 두 에이전트의 경계를 지키기 위한 의도된 2단계였다.
6. **`works.store.entities.test.ts`의 테스트 수는 6건으로 불변**이다(1건 갱신, 삭제 없음). 계획이 "지운 뒤 테스트 수를 세라"고 요구한 항목 — 이번엔 줄어들 것이 없었다.

## 남은 것 — 브라우저 UAT 8단계

계획서의 UAT 지시(화면 경로·레이블을 코드에서 인용해 적어 둔 것)가 그대로 남아 있다. jsdom이 관측할 수 없는 것들이다:
1. `/works/{workId}/bible`에서 인물 카드 선택 → 템플릿 썸네일 그리드가 **실제 그림으로** 렌더되는지(깨진 아이콘이면 샘플 서빙 문제).
2. 템플릿 선택 + `생성` → 진행 표시가 뜨고 20~60초 뒤 **대표 이미지가 크게** 뜨며 시각 묘사가 채워지는지.
3. `생성`을 다시 → 스트립에 한 장 더 쌓이고 이전 장이 사라지지 않는지(append-only).
4. 스트립의 다른 썸네일 클릭 → 대표가 바뀌고 **이름 옆 58×58 아바타**가 함께 바뀌는지. (좌측 목록 18×18은 위 발산 1로 이모지 고정 — 바뀌지 않는 것이 정상이다.)
5. **새로고침** → 이미지와 묘사가 그대로 남아 있는지(로컬 전용 `imageUrl` 철거의 실질적 증거).
6. 장소·사건·아이템 카드에서 템플릿 목록이 그 유형용으로 바뀌는지.
7. `/works/{workId}/bible/new`에 이미지 UI가 **없는지**.
8. 샘플이 없는 5개 템플릿(`photo-event`·`ink-item`·`webtoon-item`·`oil-item`·`photo-item`)이 깨진 이미지로 보이지 않는지.

**브라우저로 관측하려 하지 말 것**: 취소 시 이미지 잔존, 대표 지정의 낙관적 갱신 순서 — 타이밍 의존이라 테스트로 고정했다.

## 후속 작업 후보

- **카드별 대표 이미지 벌크 엔드포인트** → 좌측 목록·관계도 등에서 썸네일을 쓸 수 있게 한다(위 발산 1). 작은 백엔드 작업이다.
- `entity-mapping.ts:17`의 주석이 아직 `emoji/imageUrl/relations는 백엔드에 없어`라고 적혀 있다 — `imageUrl`은 이제 서버가 준다. 문구 정리.
- 5개 샘플 썸네일 미생성(task 76의 잔여) — 쿼터 회복 후 `cd api && python3 scripts/generate_template_samples.py`.
