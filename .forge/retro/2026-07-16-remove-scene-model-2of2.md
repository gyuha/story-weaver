# 2026-07-16 — web을 화(Chapter) 단위로 리팩터, Scene 잔재 제거 (part 2/2)

## Plan vs actual
- What went as planned: coarse 4슬라이스(재생성 → 데이터계층[S2+S4] → 뷰계층[S3+S5] → 최종 홀리스틱 게이트) + 적대적 검토 3렌즈로 **halt 없이 완주**. `pnpm typecheck`·`lint`·`test`(44파일 210테스트)·`build` 전부 EXIT 0(독립 재실행), 기능적 scene 잔재 0, 라우트 `write/$sceneId`→`$chapterId` 및 routeTree.gen.ts 재생성, assist SSE/401 처리(ADR-0007) 회귀 없음.
- Divergences:
  - **워크플로우 완료 직후 하네스 LSP 진단이 stale였다.** `works.store.ts`(createChapterLink 부재)·`editor-screen.tsx`(MemoryPanel scene prop)·라우트 파일(routeTree 불일치)·`memory-panel.test.tsx`(`Cannot find name 'SCENE'`) 등 TS 에러를 보고해 워크플로우 자기보고("typecheck clean")와 충돌 → 게이트 직접 재실행으로 **실제 트리는 clean** 확정(LSP가 routeTree.gen.ts 재생성·최종 리네임 정착 전 상태를 반영한 stale였음).
  - 계획 텍스트를 넘어선 리네임 다수: `Scene` 인터페이스 삭제, `flattenScenes`/`SceneLocation` 삭제, world-bible facade 메서드 개명, `ConflictSceneRef`→`ConflictChapterRef`, `manuscript.api.ts`의 scenes CRUD 전량 제거. 모두 "화 흡수" 목적에 부합·문서화·게이트 검증됨.
  - playwriter 육안 확인(계획 DoD)은 미수행 — MCP 미연결 + `:3000`이 타 체크아웃(`workspace/story-weaver/web`)을 서빙 중이라 이 브랜치 트리가 아님. 210 RTL 컴포넌트 테스트로 대체 검증.

## Learnings
- Do differently next time:
  - **백그라운드 워크플로우 직후의 하네스 LSP 진단은 stale일 수 있다.** 워크플로우가 build/generate로 생성물(routeTree.gen.ts 등)을 갱신하면 LSP가 따라오기 전 상태를 보고할 수 있음 → "typecheck 실패" 신호를 믿기 전 **게이트를 직접 재실행해 확정**할 것(이번에 실제로 stale였음).
  - #56 교훈(coarse 웨이브 + 홀리스틱 게이트)을 적용한 설계가 유효했다 — 밀결합 web 타입그래프에서 halt 없이 완주. **재사용 가치 높은 패턴**: 타입/import 그래프를 공유하는 리팩터는 중간 슬라이스에서 전 프로젝트 typecheck를 게이트로 쓰지 말고, 자기 타깃 런타임 테스트만 쓰고 최종 슬라이스에서 홀리스틱 게이트.
  - 육안 확인이 필요한 작업은 착수 전에 (a) playwriter MCP 연결 여부, (b) dev 서버가 **올바른 체크아웃**을 서빙하는지를 확인할 것 — 이번엔 `:3000`이 다른 워크스페이스였다.
- 후속 작업 후보(다음 fg-ask): ① playwriter 육안 확인(편집→저장→메모리추천→AI이어쓰기) — feature-summary/web을 별도 포트로 띄우거나 MCP 연결 후 · ② 죽은 `scenes` 필드 web 정리(`ReviewSummary.scenes`, 백엔드 part와 동반).

## Doc updates
- CONTEXT.md promotion: part 1/2 회고에서 브랜치 델타로 일괄 갱신 완료(동일 용어군) — 여기서 중복 갱신 없음.
- ADR added: none.
