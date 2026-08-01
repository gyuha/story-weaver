# STATUS — 이어쓰기 후보를 JSONL로 받기 — 형식 계약 + 4계층 관용 파서
slug: assist-candidate-format-contract
status: done
executed: 2026-07-30
completed: 2026-07-31
verified: yes (2026-07-30 브라우저 육안 UAT 5항목 통과 — 이어쓰기 5회 이상 반복해 매번 후보 개별 카드 분리·JSON 껍데기 미노출, 스켈레톤→하나씩 로딩 유지, 적용 시 본문만 삽입, 선택 영역 style 액션 후보 1개 정상(관용 계층 ④), 기획의도 이어쓰기 정상. 사전 측정: 조립된 실제 프롬프트 3회 호출 3/3 JSONL 준수. 게이트: web typecheck·lint clean·test 47파일 280건, api ruff·mypy clean)
retro: skipped (fg-next all 드라이브 자동 진행 — 학습은 run.md에 남기고 승급은 추후 fg-learn)
docs updated: none
