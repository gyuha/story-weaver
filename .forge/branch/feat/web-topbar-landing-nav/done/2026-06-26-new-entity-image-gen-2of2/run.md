# run.md — 새 엔티티 이미지 생성 + 첨부 (part 2/2)

실행일: 2026-06-26 · 슬러그: new-entity-image-gen-2of2 · task #16 · part 2/2
직접 실행. eco on.

## 계획대로 된 것
- **S1** `Entity.imageUrl?` + `NewEntityInput.imageUrl?` 추가, `addEntity`가 imageUrl 반영. `EntityDetail` 헤더와 `EntityList` 아바타가 imageUrl 있으면 `<img>`, 없으면 기존 이모지 렌더.
- **S2** `NewEntityScreen` 하단 "이미지 생성" 섹션: 프롬프트 textarea(유형·이름·외모/묘사로 기본 자동 구성) + "생성" → 결정적 mock 플레이스홀더 data-uri SVG(이모지+이름) 미리보기. 저장 시 imageUrl 포함.
- typecheck·lint 통과. playwriter로 생성→미리보기→저장→상세 헤더·목록 아바타 이미지 표시 확인(미생성 엔티티는 이모지 유지).

## 계획과 달랐던 것
- 거의 없음(분기 낮음). 계획대로.

## Non-goals 준수
- 실 생성 모델·일관성·영속화·유형 게이팅(전 유형 허용) 모두 손대지 않음(image-generation.md의 v2·인물/장소 한정과 의도적 차이).

## eco 천장
- 플레이스홀더 data-uri SVG 결정적 mock(// eco). 새 의존성 0.

## 코드 리뷰
- mock UI(타입 + 표시 분기 + 페이지 섹션), 저위험 → 생략.
