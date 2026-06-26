<!-- forge-slug: new-entity-image-gen-2of2 -->
<!-- task: 16 -->
<!-- tdd: off -->
<!-- part: 2/2 -->
# 새 엔티티 이미지 생성 섹션 + 엔티티 이미지 첨부 (part 2/2)

## Goal / Non-goals
- Goal: 새 엔티티 페이지(part 1/2) **하단에 "이미지 생성" 섹션**을 더한다 — 프롬프트 textarea(유형별 필드로 기본 프롬프트 자동 채움) + "생성" 버튼 → **mock 플레이스홀더 이미지** 미리보기. 저장 시 그 이미지를 엔티티에 **`imageUrl`로 첨부**하고, `EntityDetail`과 `EntityList`(아바타)에 표시한다.
- Non-goals: 실제 이미지 생성 모델/API, 캐릭터 일관성, 이미지 저장소·영속화, 유형 게이팅(`image-generation.md`는 v2·인물/장소 한정이나 본 mock은 전 유형 허용 — 의도적 차이), 생성 외 이미지 업로드/교체.

## Source of truth
- Glossary terms: [[엔티티 카드]] in `.forge/CONTEXT.md`
- Related ADRs: none (`docs/image-generation.md`는 v2 사전 설계 — 본 작업은 그 자리표시를 mock으로 시연; 전 유형 허용은 의도적 단순화)
- Definition of Done: 새 엔티티 페이지 하단 "이미지 생성" 섹션에서 프롬프트(기본값 자동 채움) + "생성" → 결정적 mock 플레이스홀더 이미지가 미리보기로 표시되고, 저장 시 엔티티 `imageUrl`에 담겨 `EntityDetail`(헤더 이미지)과 `EntityList`(아바타)에 보인다. 이미지 미생성 시 기존 이모지 표시 유지. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 생성→미리보기→저장→상세/목록 이미지 표시 육안 확인.

## Work slices
- [ ] S1. 모델·표시 배선 — `Entity`에 `imageUrl?: string` 추가. `addEntity` 입력·매핑이 `imageUrl`을 받도록 확장. `EntityDetail` 헤더(현재 이모지 박스)와 `EntityList` 아바타가 `imageUrl` 있으면 이미지로, 없으면 기존 이모지로 렌더 — 완료 기준: 타입·표시 분기 추가, `pnpm typecheck` 통과. (depends: part 1/2 sealed)
- [ ] S2. 이미지 생성 섹션 — `NewEntityScreen` 하단에 "이미지 생성": 프롬프트 textarea(유형/이름/외모·묘사 등으로 기본 프롬프트 자동 구성) + "생성" 버튼. 클릭 시 결정적 mock 플레이스홀더 이미지(예: 이름·이모지를 얹은 data-uri SVG) 생성해 로컬 state에 두고 미리보기. 저장 시 그 imageUrl을 `addEntity`에 포함 — 완료 기준: playwriter로 생성→미리보기, 저장 후 상세·목록에 이미지 표시 확인, `pnpm lint` 통과. (depends: S1)

## 비고 (eco)
- 새 의존성 0. 플레이스홀더는 data-uri SVG(결정적 mock — // eco: 실 생성 API로 교체). 유형 게이팅 생략(전 유형 허용). part 1/2가 먼저 봉인된 뒤 진행.
