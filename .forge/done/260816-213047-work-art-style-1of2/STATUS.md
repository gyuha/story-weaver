# STATUS — 작품 화풍 (1/2): 저장·카탈로그 축 분리·프롬프트 조립·엔드포인트
slug: work-art-style-1of2
status: done
executed: 2026-08-13
completed: 2026-08-16
verified: yes (DoD 5항목을 실 앱·실 JWT로 전부 왕복 확인 — ① 화풍 카탈로그 4개 + 각 화풍의 유형별 견본 URL, `ink`의 인물·장소·아이템 견본이 실제 `image/jpeg` 200 ② 작품 화풍 `PUT`→`GET` 왕복이 그대로 ③ SSE 생성 성공: 단계 이벤트 `prompt → image → description`, `final_prompt`에 화풍·구도·톤 어휘 전부, `visual_description` 1966자, 파일 824,052 bytes, `llm_call_logs` 두 행(12,939ms·44,964ms), 첫 이미지 자동 대표 ④ 화풍 미지정 작품의 생성이 **409**와 한국어 안내로 거부 ⑤ 남의 `work_id`는 GET·PUT 모두 404, 없는 화풍 id는 422. JWT는 앱 자신의 `create_access_token`으로 발급해 새 계정·잔여 데이터를 만들지 않았다.
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260816-212906-work-art-style-1of2.md
docs updated: api/CLAUDE.md — 마이그레이션 왕복 테스트는 head 복원 + finally
