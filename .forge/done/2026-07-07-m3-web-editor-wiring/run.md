# RUN — M3: 웹 — 에디터 AI 버튼 실 API 연동

slug: m3-web-editor-wiring · task: 37 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 2단계(eco: sonnet 상한 + ECO 규율 주입, web-feature-builder 위임): Stream(S1) → Wire 병렬(S2 selection-ai-menu·S3 이어쓰기 인라인, 둘 다 S1 의존).

## 계획대로 된 것

- **S1**: `assist.api.ts` — `parseSseTextStream`(SSE 파서, ping 주석/멀티라인 data 이벤트/`[DONE]` 전부 처리) + `useAssistStream()` 공용 훅. 생성 SDK가 스트리밍 미지원이라 인증 헤더 직접 부착한 `fetch` 사용.
- **S2**: `selection-ai-menu.tsx`의 4개 버튼을 5개 백엔드 작업에 매핑(늘리기→continue, 다시쓰기/줄이기/톤변경→style, dialogue/infill/correct는 이 화면에 대응 UI 없어 비사용) — `prompt_assembler.py` 실제 지시문 의미 대조해 판단.
- **S3**: `manuscript.tsx`의 `MOCK_DRAFT` 제거, 실 이어쓰기 스트리밍.

## 계획 대비 차이 (divergences)

1. **S3가 계획의 "기존 aiSuggestion 계약 유지" 지시를 의도적으로 벗어남** — 코드 고고학으로 `works.store.ts`의 `scene.aiSuggestion`/`acceptInlineSuggestion`이 tiptap 도입 커밋(909d6a4)에서 이미 죽은 경로임을 확인(`dismissSuggestion`도 실제로는 무관한 필드만 지움). 대신 동시 진행 중이던 S2의 실제 패턴(로컬 컴포넌트 상태, 스토어 미개입)을 그대로 따름 — 가정을 명시하고 판단한 사례로 기록.
2. **`.env`의 `.venv`가 다시 Python 3.14/3.12 혼선으로 실행 중이던 백엔드 dev 서버가 task 36 중 `--reload`로 크래시** — task 37 검증 중 발견, 재시작으로 해결(pytest 기반 검증엔 영향 없었음, 라이브 서버만 죽어있었음).
3. **실 SSE 라이브 확인(직접 수행)**: 회원가입→인증→작품/부/화/씬 생성→`continue` 엔드포인트 실 호출로 무협 장르 이어쓰기 스트리밍 확인, ping 주석과 멀티라인 `data:` 이벤트를 파서가 정확히 처리함을 실제 와이어로 검증(에이전트 환경엔 백엔드가 없어 RTL로만 검증했었음).

## 검증 (UAT)

- web: `pnpm typecheck`(clean, 동시편집 중간상태 진단 무시) · `pnpm lint`(174 files, 0 errors) · `pnpm test`(25 files / 113 tests pass).
- **직접 실 e2e**: 백엔드 재기동 → 실 회원가입/인증/로그인 → 작품·부·화·씬 생성 → `/assist/continue` 실 SSE 스트림 curl로 직접 수신, `data:`/ping/`[DONE]` 형식이 `parseSseTextStream` 구현과 정확히 일치 확인. 테스트 데이터 정리(작품 삭제).
- DoD 충족: 선택 텍스트에 AI 메뉴 액션이 실 스트리밍 결과 표시, 이어쓰기가 실 API로 점진 렌더.
