# STATUS — 작품 챗 취소 완결 — 중단 버튼 배선과 취소된 부분 답변의 정직한 기록
slug: work-chat-cancel-completion
status: done
executed: 2026-08-01
completed: 2026-08-01
verified: yes (2026-08-01 운영 로그 + 실스택 테스트 조합 — llm_call_logs에 사상 처음 task='chat' + error='cancelled' 행 발생(resp_len 0, latency 2220ms) → 작품 챗 취소 경로가 운영에서 실제 발동. 완주 메시지는 finish_reason='stop'으로 정상 기록(회귀 없음). finish_reason='cancelled' 저장과 부분 답변 보존은 실스택 테스트로 증명 — 운영 제너레이터 _stream_work_chat_response를 실제 uvicorn + 실제 클라이언트 끊김으로 태워 단정하며, 플래그를 제거하면 실스택·단위 양쪽이 red(직접 확인). 게이트: api 940 passed 신규 실패 0·ruff·mypy clean, web 287 passed·typecheck·lint clean. 한계: 운영 로그에 '토큰 도달 후 취소' 샘플이 없다 — 두 번의 시도가 각각 편집기 경로 오조작과 첫 토큰 전 취소로 갈렸고, resp_len=0이면 if collected_chunks 가드가 저장을 건너뛰는 것이 정상 동작이다)
retro: /Users/gyuha/workspace/story-weaver/.forge/retro/260801-072534-work-chat-cancel-completion.md
docs updated: ADR 260801-072534-keep-cancelled-partial-answer-in-context 추가 / CONTEXT.md 없음 / 훅 forge-claim-check.py에 4·5번 항목 추가
