<!-- forge-slug: summary-draft-3of3 -->
<!-- task: 71 -->
# 실행 기록 — 늘려쓰기 (3/3) 요약으로 본문을 쓰고 화에 반영

## 슬라이스 결과
- S1 `draft` 태스크 프론트 배선(`pnpm generate` + `AssistTaskType`·`AssistPayloadMap`·`DraftRequest`) — ✅ 계획대로
- S2 `늘려쓰기` 버튼 + 요약 선저장 + 대체 확인 — ✅ 계획대로
- S3 완료 후 일괄 반영(전용 전이 ref · escape · 모달 닫기) — ⚠ 계획에 없던 **닫기 취소 경로의 원고 유실 버그**를 실행 중 발견해 함께 고쳤다(아래 발산 1)
- (UAT 후속) 모달 흐름 개편 — ⚠ 계획엔 없던 4건: 즉시 닫힘 · 진행 다이얼로그 · 레이블 개칭 · 편집란 높이 (아래 발산 6~9)

## 발산

### 1. 계획의 완성기준 S3-②가 **거짓 초록**이었다 — 실제 `stop()`은 완료 전이를 만든다
계획은 "생성 중 `닫기` → `stop` 호출 + `setContent` 미호출"을 완성기준으로 뒀고, 그 테스트는 구현 직후 **통과했다**. 그런데 통과 이유가 틀렸다. 테스트의 `stop` 목은 `vi.fn()`이라 `isStreaming`을 건드리지 않는다. 실제 구현(`assist.api.ts:202`)은

```ts
const stop = useCallback(() => { abortRef.current?.abort(); }, []);
```

이고, abort는 `start`의 `for await`를 AbortError로 깨뜨려 `finally { setIsStreaming(false) }`에 도달한다. **즉 운영에서는 닫기 직후 스트리밍 true→false 전이가 실제로 발생하고**, `draftingBody`가 아직 true이므로 늘려쓰기 완료 효과가 발동해 **쓰다 만 생성물이 본문을 덮어쓴다.** 계획이 지목한 "가장 그럴듯한 사고" 세 개 중 어디에도 없던 네 번째 사고다.

재현 테스트를 먼저 추가해 red를 확인했다(`닫기로 끊긴 스트림의 부분 생성물은 본문에 들어가지 않는다`) — abort의 `finally`가 하는 일을 `act(() => setMockAssistState({ isStreaming: false }))`로 재현한다. 고침은 `onClose`에서 `setDraftingBody(false)`를 `assist.stop()`보다 먼저 부르는 것. 이 한 줄을 지우면 다시 red가 되는 것까지 확인했다.

이 패턴 자체는 저장소에서 반복된 것이다 — 취소(anyio 스코프), 타입 유니온(목이 타입 우회), 손조립 응답(기본값 `None`)에 이어 **네 번째로 "테스트는 초록인데 실제 경로는 깨진 것"**이고, 이번엔 **목이 부작용을 재현하지 않아서**였다.

### 2. 계획에 없던 방어를 하나 넣었다가 검증에 실패해 **되물렸다**
요약 완료 효과에 `|| draftingBody` 게이트를 넣어 "늘려쓰기 중에는 요약 효과가 발동하지 않는다"를 막으려 했다. 그런데 그 절을 지우고 테스트를 돌려도 **초록이었다** — 즉 어떤 테스트도 이 방어를 붙잡지 못한다. 이유를 따라가 보니 `runDraft`는 `summaryPhase`를 건드리지 않고 `늘려쓰기` 버튼은 busy 동안 disabled라, 늘려쓰기 중 `summaryPhase`는 언제나 `'idle'`이다. 앞 조건(`summaryPhase !== 'generating'`)이 이미 막으므로 **도달 불가능한 코드**였다. 지웠다. 실제 분리를 담보하는 것은 전용 ref(`prevDraftStreamingRef`)이고, 그건 공유로 바꾸면 red가 되는 것으로 확인했다.

### 3. 방어 4개를 각각 깨뜨려 red를 확인했다 (계획엔 없던 절차)
| 깨뜨린 것 | 결과 |
| --- | --- |
| `prevDraftStreamingRef` → 요약 ref 공유 | ❌ 2건 red (본문 반영·escape) |
| 대체 확인(`chapter.paragraphs.length` 분기) 제거 | ❌ 2건 red (취소 시 미생성·확인 후 생성) |
| `escapeHtml` 제거 | ❌ 1건 red |
| `onClose`의 `setDraftingBody(false)` 제거 | ❌ 1건 red (발산 1의 재현 테스트) |
| `|| draftingBody` 게이트 제거 | ⚠ **초록** → 도달 불가로 판정하고 제거(발산 2) |

### 4. `summary-modal.test.tsx`가 typecheck를 깨뜨렸다 — 테스트는 초록이었다
`onDraft`를 필수 prop으로 넣자 기존 모달 테스트의 `base` 객체가 그 prop을 빠뜨려 **`pnpm typecheck`만 4건 실패**했다(vitest는 통과). #68에서 `AssistTaskType`으로 겪은 것과 같은 종류이며, 계획의 검증 노트가 S1에만 typecheck를 명시했지만 실제로는 S2에서도 필요했다. `base`에 `onDraft: vi.fn()`을 넣고, 모달 단위 테스트 2건(`늘려쓰기`가 편집란 현재 값으로 불린다 / 생성 중 disabled)을 함께 추가했다.

### 5. 모달의 진행 표시를 `phase={draftingBody ? 'generating' : summaryPhase}`로 재사용했다
계획은 늘려쓰기 중 모달 상태를 명시하지 않았다. 새 phase 값을 만들지 않고 기존 `generating`을 재사용해 스켈레톤·버튼 비활성을 그대로 얻었다 — 늘려쓰기와 요약은 같은 스트림을 쓰므로 동시 진행이 불가능해 구분할 이유가 없다.

## 게이트
- `pnpm typecheck` clean · `pnpm lint` clean(222 files) · `pnpm test` **340 passed (50 files)**
- 이 파트의 신규 테스트 **11건** (실측 — `awk '/describe\('"'"'ManuscriptEditor 늘려쓰기/,0' … | grep -c "^  it("` → 10, summary-modal은 `grep -c "^  it("`가 11→12): `ManuscriptEditor 늘려쓰기` describe 10건 + summary-modal 1건(`늘려쓰기는 편집란의 현재 값으로 불린다`). 기존 summary-modal `생성 중` 테스트에는 `늘려쓰기` disabled 단정 한 줄을 덧붙였다. 10건 중 1건은 발산 1의 실제 버그 재현 테스트다.
  - 처음 "10건(manuscript 9 + modal 2)"이라고 적었다가 세어 보니 틀렸다 — 훅 점검 1번(사실 주장에 확인 수단)에 걸려 실측으로 고쳤다.
- api 무변경(계획의 Non-goals대로 part 1/3의 `draft` 태스크를 소비만)


## UAT 발산 (브라우저 확인 라운드에서 나온 것)

계획은 UAT를 "확인 후 본문 반영이 되는가"로만 잡았는데, 실제로 돌려 보니 **모달 흐름 자체**가 네 번 바뀌었다. UI 작업은 화면에서 만져 봐야 결정되는 부분이 있다는 것이 이번의 큰 학습이다 — 계획 단계의 그릴링으로는 여기까지 좁혀지지 않았다.

### 6. `늘려쓰기`를 눌러도 요약 모달이 그대로 열려 있었다
계획의 S3은 "완료 후 모달을 닫는다"였다. 사용자는 **누르는 즉시** 닫히길 원했다(생성 중 요약창이 본문을 가린다). 즉시 닫으면 스켈레톤(진행 표시)과 `닫기`(중단 수단)가 함께 사라지므로, 진행 토스트(`중단` 액션 포함)로 두 역할을 옮겼다.

**측정한 함정**: 부모가 `open`을 false로 내릴 때 Base UI `Dialog`가 `onOpenChange`를 쏘면 `onClose`가 `assist.stop()`을 불러 **생성이 즉시 취소된다**. `stopSpy` 미호출 단정으로 확인했고 — 쏘지 않았다. 추측했다면 "눌렀는데 아무것도 안 나온다"가 될 자리였다.

### 7. 진행 표시를 토스트 → 다이얼로그로 다시 바꿨다
사용자가 확인 → 두 창 모두 닫힘 → `AI로 작성 중` 다이얼로그 → 완료 시 닫힘 흐름을 지정했다. `DraftProgressModal`을 만들고 `open`을 `draftingBody` 하나에 묶어 완료·중단 시 스스로 닫히게 했다(닫는 시점을 따로 관리하지 않는다). 직전 단계에 넣은 토스트 코드는 제거했다. `중단` 버튼은 요청에 없었지만 유지했다 — 본문을 대체하는 생성이라 멈출 길이 없으면 안 된다(#66에서 정한 원칙).

### 8. 확인창이 요약 모달 **아래로 깔렸다** — 내 진단이 두 번 틀렸다
1차 진단: "양쪽 z-index가 50이고 Base UI가 DOM 순서로 이긴다" → `zIndex: 60`을 줬다. 그 과정에서 `ModalDefault`가 `zIndex`를 **prop으로 선언만 하고 `Modal.Container`에 넘기지 않는** 죽은 prop을 발견해 고치고 렌더된 style을 단정하는 테스트로 red까지 확인했다. **그래도 화면에서는 여전히 아래로 깔렸다.**

2차 진단(실제 원인): `Modal.Ground`가 `fixed inset-0 z-50`이라 **stacking context를 만든다**(`modal.tsx:75`). 그 자식인 `Modal.Container`의 z-index는 컨텍스트 **안에서만** 경쟁하므로, 바깥의 Base UI Dialog(z-50, body 끝 포털)를 **60이든 6000이든 넘지 못한다**.

**여기서의 학습**: 내 z-index 테스트는 "style에 값이 붙는다"를 정확히 증명했지만 **목표(위에 그려진다)를 증명하지 못했다**. jsdom은 페인팅을 하지 않는다. 방어를 깨서 red를 확인하는 절차를 거쳤는데도 **테스트가 검증하는 명제가 목표와 달랐던** 경우다 — "red가 된다"가 "옳은 것을 검증한다"를 보장하지 않는다.

해법(사용자 지시): 확인창도 Base UI `Dialog`로 통일했다(`components/ui/confirm-dialog.tsx`). `useModal`·`zIndex: 60`을 걷어내고, `modal-default.tsx` 수정과 그 테스트는 **되돌렸다** — 이 해법에서 쓰이지 않아 남기면 아무도 안 쓰는 공유 컴포넌트 변경이 된다. 부수 효과로 테스트에서 **모달 스토어 목이 사라졌다**(확인창을 실제로 렌더해 `확인`/`취소`를 직접 누른다) — 목이 실제 경로를 가리던 문제가 함께 없어졌다.

**남은 사실**: `useModal`의 `zIndex`는 여전히 선언만 되고 무시되는 죽은 prop이다. 지금은 넘기는 호출부가 없어 무해하다(grep 전수). 고치지 않고 기록만 한다.

### 9. 레이블 개칭과 편집란 높이
- 모달 제목 `AI 요약` → **`요약`**, 버튼 `AI 요약` → **`AI로 본문 요약`**, `늘려쓰기` → **`요약으로 본문 작성`**, `저장` → **`요약 저장`**. 사용자가 명시적 문구를 지정했다.
  - **일괄 치환 사고**: `저장` → `요약 저장`을 파일 전체에 치환해 **칩 줄의 화 저장** 버튼을 가리키던 테스트 6곳까지 바꿨고 5건이 red로 떨어졌다. 각 위치가 어느 `describe`에 속하는지 확인해 모달 저장 2곳만 남기고 되돌렸다. 프로덕션 코드에는 영향이 없었다.
  - **글로서리 충돌(미해결)**: `.forge/CONTEXT.md:96`의 용어가 `늘려쓰기 (Draft from Summary)`인데 화면에 그 낱말이 없어졌다. 회고에서 (A) 용어는 유지하고 "UI 레이블은 `요약으로 본문 작성`" 한 줄 추가 (B) 용어 자체 개칭 중 하나를 결정해야 한다.
- 편집란 높이를 `min-h-[112px]` → **`min-h-[min(270px,40vh)] max-h-[55vh]`**. 이미지에서 측정(모달 폭 1117px ÷ 코드의 `max-w-[560px]` = 2배 DPI → 540px 상자 = CSS 270px).
  - **측정 2건**: ① `cn`이 `twMerge`라 베이스 `Textarea`의 `min-h-16`이 제거되는지 실측(`flex field-sizing-content w-full min-h-[min(270px,40vh)] max-h-[55vh]` 관측) ② `pnpm build` 후 CSS에 `.min-h-[min(270px,40vh)]{min-height:min(270px,40vh)}`가 생성되는지 확인. 둘 다 추측하면 조용히 아무 일도 안 할 자리였다.
  - `DialogContent`에 `max-h`가 없어(`fixed top-1/2 -translate-y-1/2`뿐) 하한을 `min(270px,40vh)`로 묶었다 — 짧은 창에서 하단 버튼이 화면 밖으로 나가는 것을 막는다(선택 영역 팝오버로 이미 지적된 실패 양상).

## 최종 게이트
- web `pnpm typecheck` clean · `pnpm lint` clean(224 files) · `pnpm test` **342 passed (50 files)**
- 실측 2건: 실제 TipTap으로 `setContent` → `undo()` **한 번**에 원문 복귀(`before`/`restored` 일치, `canUndo: true`) · `assist.api.ts:202`의 `stop()`이 abort → `finally`에서 `isStreaming`을 내려 완료 전이를 만든다
- 방어 검증 누적: 전이 ref 공유·대체 확인·escape·중단 시 플래그 선행 해제·진행 다이얼로그 렌더·즉시 닫힘·ConfirmDialog의 Base UI 여부 — 각각 제거 시 red 확인. 반대로 `|| draftingBody` 게이트는 깨도 초록이라 도달 불가로 판정해 제거했다.
- 브라우저 UAT: 사용자 확인 — "현재 정상 동작 함"
