# 2026-07-25 — 새 작품 만들기: 장르 데이터 기반 3-스텝 위저드 페이지로 개편

## 계획 vs 실제

- **계획대로 된 것**: DoD 4항목과 S1~S4 완성기준 전부 충족, Non-goals 침범 없음. 17개 장르 프리셋을 JSON 단일 출처로 분리(zod 로드 시 1회 검증), 기존 `popover`+`command`(cmdk)만으로 검색 셀렉트 조립(신규 의존성 0), 모달→페이지 리네임과 라우트 배선, 제출 payload의 프리셋+자유 태그 병합·중복제거. `typecheck`·`lint` clean, `test` 47 files/238 green.
- **사소한 현장 결정**: `Genre`를 zod 산출물이 아니라 원본 JSON import의 `keyof typeof`에서 파생(`z.record`가 키를 `string`으로 넓히는 문제 회피) · `components/ui/popover.tsx`의 실제 기반은 radix-ui가 아니라 `@base-ui/react/popover`였음(플랜 문구의 사실 오류 수준) · 페이지 셸에 딤 오버레이 대신 기존 `AuthLayout`의 `bg-board` 캔버스 어휘 재사용 · 초기 장르를 `null`로(게이팅이 의미를 갖도록) · 구 `Genre` 유니온을 orphan으로 판단해 제거.
- **진짜 divergence(하나)**: 완성기준이 "테스트 통과"로 정의됐고 **실제로 전부 통과했는데도 한국어 사용자에겐 첫 입력부터 깨져 있었다.** 자유 키워드에 한글을 입력하고 Enter를 누르면 태그가 둘로 쪼개졌다(`먼치킨` → `먼치킨` + `킨`). 사용자가 브라우저에서 발견했고, 그 시점 STATUS는 이미 `verified: yes`였다 → `failed`로 정정 후 수정, 재검증 대기(`pending`)로 이 회고를 진행.
- **워크플로우 리뷰가 잡은 것**: 동일 장르 재클릭 시 프리셋 키워드·사용자가 바꾼 문체가 조용히 초기화되던 major 결함 1건(리뷰어가 실제 렌더링으로 재현) → `if (nextGenre === genre) return;` 가드 + 재현 테스트로 in-run 수정. 조건부 코드리뷰가 값을 했다.

## 학습

- **테스트 green은 한글 입력 검증을 대체하지 못한다 — 원리적으로.** RTL `userEvent.type`은 composition 이벤트를 만들지 않고, 브라우저 자동 입력(Playwright `type`/`press`)도 IME를 우회해 문자를 직접 삽입한다. 즉 **한글 입력 경로는 자동 테스트에 보이지 않는다.** 이번엔 슬라이스 테스트 22건·전체 235건·라이브 `browse` QA가 모두 통과한 상태에서 결함이 살아 있었다. 그런데도 `verified: yes`를 테스트 green만으로 기록한 것이 오판이었다.
- **다음엔 이렇게 ①** — 한국어 제품에서 **Enter/Backspace로 커밋하는 입력은 `isComposing` 가드를 기본값**으로 두고, 슬라이스 완성기준에 넣는다. Enter뿐 아니라 Backspace도 막아야 한다(조합 중 Backspace는 자모 삭제). 조합 중 Enter를 무시하면 한글 사용자는 Enter를 두 번 누르게 되는데, 이게 네이버·GitHub·Slack과 동일한 표준 동작이다.
- **다음엔 이렇게 ②** — 텍스트 입력 UI의 UAT는 **"테스트 green"을 증거로 쓰지 않는다.** 사람의 한글 타이핑을 필수 게이트로 두고, 그것 없이는 `verified: yes`를 기록하지 않는다. 이번에 검증 경로를 끝까지 소진해 확인한 사실: jsdom은 composition 미발생 / Playwright `type`은 IME 우회 / `browse`의 CDP는 deny-default allowlist에 **`Input` 도메인 자체가 없어** `Input.imeSetComposition`이 403 / `Runtime.evaluate`로 합성 composition 이벤트를 쏘는 건 Blink의 실제 조합 버퍼를 만들지 못해 "잔여 음절 재삽입"(두 번째 태그의 진짜 원인)을 재현 못 함 / playwriter MCP는 이 세션 미등록. **결론: 이 항목은 도구 부족이 아니라 사람만 확인할 수 있는 종류다.**
- **다음엔 이렇게 ③** — jsdom 회귀 테스트는 실제 조합 버퍼를 재현할 수 없으니 `fireEvent.keyDown(input, { key: 'Enter', isComposing: true })`로 **근본 원인(가드)을 고정**하는 방식이 최선이다. 그리고 그 테스트는 **가드를 일시 제거해 실제로 실패하는지 반드시 확인**할 것 — 이번에 확인했고(3 failed | 13 passed) 그래서 무의미한 테스트가 아니라고 말할 수 있다.
- **다음엔 이렇게 ④** — 병렬 슬라이스 실행 중에는 저장소 전체 `typecheck`/`lint`를 돌리지 않는 게 맞았다(남의 진행 중 편집으로 오탐 → 서로 고치려 드는 사고). 대신 각자 테스트만 scoped 실행하고 전체 검증은 통합·검증 단계에 모은다. S1의 완성기준에 있던 `typecheck green`을 이 단계로 이연했고 결과적으로 충족됐다.
- **환경 사실** — `CLAUDE.md`는 UI 육안 확인에 playwriter MCP를 지시하지만 이 세션엔 미등록이었다. gstack `browse`로 대체 가능하나, 그 과정에서 dev 백엔드에 **일회용 테스트 계정과 작품 데이터가 남는다**(가입 + Mailpit 이메일 검증). 라이브 QA를 시킬 땐 정리까지 지시하는 게 좋다.
- **잔여 부채** — jsdom cmdk 폴리필(`ResizeObserver`/`scrollIntoView`)이 `genre-select.test.tsx`·`new-work-screen.test.tsx` 2곳에 중복. `src/test/setup.ts` 승급 후보(병렬 단계에서 공유 파일을 피하려다 생긴 중복).

## 후속 작업 후보

- **한글 IME Enter 가드 전수 적용** — 같은 결함이 4곳에 그대로 남아 있다: `features/memory/components/memory-panel.tsx:648`(`Enter && !shiftKey` 채팅 전송 — **영향 최대, 매일 쓰는 경로**) · `features/works/components/synopsis-editor.tsx:97`(Enter→blur 제목 확정) · `features/editor/components/manuscript.tsx:232`(Enter→blur 화 제목 확정) · `components/layout/work-tree.tsx:418`(Enter→이름변경 확정). 공용 헬퍼 하나로 묶어 재발 차단할 것. 승급은 하지 않았으나 우선순위 높음.
- jsdom cmdk 폴리필을 `src/test/setup.ts`로 승급해 2곳 중복 제거.
- Base UI `nativeButton` 경고 정리(`LandingScreen` 계열 — 라이브 QA 중 발견, 이번 작업 무관).
- dev 백엔드에 남은 일회용 QA 계정·작품 데이터 정리.
- 장르 프리셋 키워드·문체 예시 초안 문안 검수(현재는 이번 작업에서 작성한 초안).

## 문서 갱신

- CONTEXT.md 승급: 없음 — IME·테스트 한계는 도메인 용어가 아니라 구현·검증 세부(용어집 오염 방지).
- ADR 추가: 없음 — 3조건 미충족. 가드는 사이트당 한 줄이라 되돌리기 쉽고, 트레이드오프도 "한글 사용자가 Enter를 두 번 누른다"는 업계 표준 동작이다. (사용자 판단으로 `web/CLAUDE.md` 컨벤션 추가도 보류 — 위 "후속 작업 후보"의 전수 적용 작업에서 함께 다루는 편이 낫다.)
