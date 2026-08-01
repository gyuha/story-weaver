# STATUS — 연령·수위 제한 제거 — 모더레이션 가드와 프롬프트 수위 지시 걷어내기
slug: remove-content-rating-guards
status: done
executed: 2026-07-30
completed: 2026-07-31
verified: yes (2026-07-30 브라우저 육안 UAT 3항목 통과 — ① '뒤를 돌아보지 마십시오' 원고에서 이어쓰기·작품 챗 차단 해제 확인 ② 거절 시 '수위' 없는 정직한 문구·자동 순화 없음 ③ 새 작품 생성 400 없음. 게이트: ruff+mypy clean, task test 923 passed/커버리지 79.81%(기존 Makefile 실패 12건은 무관), 강제 코드 잔재 grep 0건)
retro: skipped (fg-next all 드라이브 자동 진행 — 학습은 run.md에 남기고 승급은 추후 fg-learn)
docs updated: CONTEXT.md: AI 이어쓰기 추가·계정 승인 [미구현] 표시 / ADR 260730-070532 (연령 제한 제거, ADR-0003 대체)
