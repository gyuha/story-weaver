# STATUS — 화 요약 (2/2) 요약 버튼 배선과 검토 화면 한눈에 보기
slug: chapter-summary-2of2
status: executed
executed: 2026-08-03
verified: yes (2026-08-03 브라우저 UAT 4항목 통과 — 요약 칩→AI 요약 모달→적용 저장, 검토·타임라인의 화별 요약 섹션(충돌 뒤·상태 테이블 앞), 새로고침 후 보존, 취소 시 미저장. DB 증거: chapters.summary가 기준선 0/8 → 2/8로 늘고 내용이 사건 중심 서술문(139·154자, JSON 껍데기 없음); llm_call_logs에 assist.summary 3건 오류 0(81~154자, 2.3~4.2초). 게이트: web typecheck·lint clean·315 tests passed, api 949 passed 신규 실패 0. 방어 검증: saveChapterSummary가 body를 동봉하도록 임시 변경하니 스토어 테스트 red — part 1/2의 재임베딩 절약이 실제로 지켜지고 있다)
retro: pending
