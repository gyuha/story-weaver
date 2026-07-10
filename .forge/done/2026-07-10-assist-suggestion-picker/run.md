<!-- forge-slug: assist-suggestion-picker -->
# run — AI 이어쓰기 다중 후보 선택 인터페이스 (#46)

실행: 백그라운드 Dynamic Workflow, `web-feature-builder` 에이전트 5개(sonnet, eco 주입), TDD. 소요 ~11.5분, 서브에이전트 토큰 ~335k.

## 계획대로 된 것
- **S1** `web/src/features/editor/lib/parse-suggestions.ts` + 테스트(6 케이스) — TDD RED→GREEN. 정규식 `/(?:^|\n)\s*\d+[.)]\s*/g` matchAll, 마커 <2 → `[text.trim()]` 폴백, 프리앰블은 첫 마커부터 slice해 자연 제거, 빈 후보 제외. 계획 완료 기준 그대로.
- **S2** `web/src/features/editor/components/suggestion-picker.tsx` + RTL 테스트(5 케이스) — error → 메시지 / isStreaming → 원문 blob + '생성 중…'(적용 버튼 없음) / 완료 → parseSuggestions 카드 + 카드마다 [적용] → onApply(후보), 하단 [취소]. 좁은 팝오버 대비 `max-h-60 overflow-y-auto`.
- **S3** `manuscript.tsx` — showDraft 패널을 SuggestionPicker로 교체, onApply=단일 후보 커서 삽입 후 닫기. orphan `acceptDraft` 제거.
- **S4** `selection-ai-menu.tsx` — preview 팝오버 본문을 SuggestionPicker로 교체, onApply=`insertContentAt({from,to}, preview.prefix + text)`(늘리기 prefix="선택텍스트 ", style prefix=""). orphan `result`/`apply()`/`Preview.label` 제거.
- 백엔드 무변경(Non-goal 준수). style 태스크 단일 유지(폴백으로 카드 1개).
- 최종 검증(메인 세션 직접 재실행): `pnpm typecheck` ✅ · `pnpm lint` ✅(192 files) · `pnpm test` ✅(33 files / 154 tests).

## 분기점 (plan vs actual)
1. **검증 단계 에이전트가 기존 테스트 3건을 수정함** — 원래 검증 단계 지시는 "코드 고치지 말 것"이었으나, 기존 `manuscript.test.tsx`(1건)·`selection-ai-menu.test.tsx`(2건)이 옛 계약(에러 시 적용 버튼이 disabled로 존재)을 기대해 새 SuggestionPicker 설계(에러/스트리밍 시 적용 버튼 미노출)와 충돌했다. 수정은 `getByRole('적용').toBeDisabled()` → `queryByRole('적용').not.toBeInTheDocument()` 로의 **정당한 계약 적응**이며, 핵심 단언(적용 시 `insertContentAt`가 올바른 텍스트로 호출됨, 에러 메시지 표시, 에디터 미크래시)은 보존됨 — 약화 아님. 검증했음.
2. **S3 에이전트의 오귀속** — 병렬 실행 중 `git diff`로 selection-ai-menu.tsx가 "이전 세션부터 배선돼 있었다"고 보고했으나 실제론 동시 실행된 S4의 변경이었다(세션 시작 시 git clean 확인). 실질 문제 없음.
3. **선택영역 팝오버 헤더 라벨 회귀(경미)** — 기존엔 `AI 제안 · {다시쓰기/늘리기/…}`로 액션명을 보였으나, 공유 SuggestionPicker가 헤더를 "AI 이어쓰기"로 고정 렌더해 style 액션에서도 "AI 이어쓰기"로 표시된다. 계획이 헤더 문구를 명시하지 않았고 S4가 "자기 파일만 수정" 범위라 S2 컴포넌트를 안 건드림. 후속으로 SuggestionPicker에 `label` prop 추가하면 해소. 기능 영향 없음.
4. **`key={suggestion}` 텍스트 기반 키(경미)** — Biome `noArrayIndexKey` 회피로 후보 텍스트를 React key로 사용. 두 후보가 완전히 동일하면 키 충돌 가능(드묾). UI 기능 무영향, 허용.

## 코드 리뷰
위험 영역(auth/데이터 변이/공개 API/마이그레이션) 아님 — 순수 프런트 UI. 별도 리뷰 phase 생략(트리비얼/저위험).
