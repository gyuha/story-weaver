<!-- forge-slug: editor-right-panel-tabs -->
<!-- task: 7 -->
<!-- tdd: off -->
# 집필 화면 오른쪽 패널을 탭 2개(설정 참고 · 채팅)로 분리

## Goal / Non-goals
- Goal: 집필(write) 화면 우측 `MemoryPanel`을 탭 구조로 바꿔 (1) **설정 참고** 탭 = 현재의 "이 씬의 기억"(씬-엔티티 링크·벡터·AI 제안) 내용 그대로, (2) **채팅** 탭 = ChatGPT 스타일 mock 채팅 UI(말풍선 + 입력창)를 제공한다. 기본 활성 탭은 설정 참고.
- Non-goals: 실제 AI/백엔드 연동, 응답 스트리밍, 채팅 기록 저장·영속화(씬 이동 시 초기화되는 ephemeral 상태로 충분), 채팅 내용을 메모리/엔티티에 반영, 멀티 세션. 모두 이번 mock UI 범위 밖.

## Source of truth
- Glossary terms: [[메모리]] in `.forge/CONTEXT.md` (설정 참고 탭이 보여주는 것 = 메모리). 채팅 탭은 mock UI 탐색물이라 신규 용어 미확정 — 글로서리 추가 없음.
- Related ADRs: none
- Definition of Done: `/works/<id>/write/<sceneId>` 우측 패널 상단에 `설정 참고`·`채팅` 탭이 보이고 — 설정 참고 탭은 기존 메모리 카드/AI 제안이 그대로 렌더, 채팅 탭은 입력창에 텍스트를 넣고 전송하면 사용자 말풍선이 추가되고 곧이어 고정 mock 응답 말풍선이 붙는다. 접기/펼치기 버튼은 유지. `pnpm typecheck` + `pnpm lint` 통과, playwriter로 두 탭 전환·채팅 전송 육안 확인.

## Work slices
- [ ] S1. `memory-panel.tsx`에 탭 셸 추가 — 상단 헤더를 `설정 참고 | 채팅` 탭 스위처로 바꾸고(접기 버튼 유지), 활성 탭 로컬 state(기본 `설정 참고`). 기존 메모리 본문(linked/vector/updateSuggestion/빈 상태)을 `설정 참고` 탭 콘텐츠로 그대로 이동. 접힘(collapsed) 동작·`aside` 폭 유지 — 완료 기준: 펼친 상태에서 두 탭이 보이고 설정 참고 탭이 기존과 동일하게 렌더, `pnpm typecheck` 통과.
- [ ] S2. 채팅 탭 mock UI — 말풍선 리스트(사용자=우측, AI=좌측, ChatGPT 스타일) + 하단 입력창 + 전송(버튼·Enter). 전송 시 사용자 메시지 추가 후 고정 mock 응답 1개 append. 메시지는 ephemeral `useState`(영속화 없음). 빈 상태 placeholder 한 줄 — 완료 기준: playwriter로 채팅 탭에서 입력·전송 → 사용자+mock응답 말풍선 노출 확인, `pnpm lint` 통과. (depends: S1)

## 비고 (eco)
- 채팅은 순수 mock — 응답은 고정 문자열 1개(// eco: 고정 mock 응답, 실제 연동 시 교체). 새 스토어·새 파일 만들지 않고 `memory-panel.tsx` 안에서 처리(최소 diff). 채팅 영속화는 설계가 굳으면 추가.
