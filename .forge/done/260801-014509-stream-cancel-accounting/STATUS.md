# STATUS — 스트리밍 취소 회계 — 취소된 생성을 로그·예산에 남기고, 기획의도 취소가 실제로 멈추게 한다
slug: stream-cancel-accounting
status: done
executed: 2026-07-31
completed: 2026-08-01
verified: yes (2026-08-01 운영 로그 + 테스트 조합 — llm_call_logs에 error='cancelled' 행 2건 신규 발생(assist.continue), 그 행의 latency 1167·1202ms 대비 완주 행 5810·6147ms로 서버 생성이 실제로 잘렸음이 확인됨; 완주 행은 여전히 error=none 1행이라 이중 차감 없음. 부분 응답 담김·shield 필수성은 테스트로 증명(단위: response=='부분' 단정 / 통합: 실스택 끊김 후 차감 완주, shield 제거 시 red — 단위는 shield 없이도 green이라 거짓 통과함을 실측). 게이트: api 938 passed 신규 실패 0·ruff·mypy clean, web 283 passed·typecheck·lint clean. 한계: 운영 로그에 resp_len>0인 취소 샘플은 못 얻었다 — JSONL이라 후보 카드가 뜨는 시점엔 생성이 거의 끝나 있어 중간 취소 창이 좁고, 두 번의 시도가 각각 '첫 토큰 전 취소'와 '완주 후 클릭'으로 갈렸다)
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260801-014029-stream-cancel-accounting.md
docs updated: CONTEXT.md: 사용량 한도 (Usage Limit) 신설 / ADR 260801-014029-charge-cancelled-generation-usage
