# STATUS — 화 버전 기록 (1/2): 저장마다 스냅샷을 쌓는 백엔드
slug: chapter-version-history-1of2
status: done
executed: 2026-08-06
completed: 2026-08-06
verified: yes (TDD 슬라이스 테스트 green — manuscript 68 passed, 전체 977 passed·1 skipped·커버리지 79.91%; 기존 실패 12건은 `ls Makefile api/Makefile` 둘 다 부재로 무관 확인. ruff·mypy(159 files)·mypy --strict(manuscript 12 files) 전부 clean. `alembic current` = `0004_chapter_versions (head)`로 개발 DB 적용 확인, 마이그레이션 백필 조건 `body <> ''`·`gen_random_uuid()` 코드 열람 확인. 리뷰가 잡은 요약 불변식 버그(body+summary 동시 PATCH + dedup)를 수정한 뒤 그 방어를 `pass`로 깨서 red를 메인 세션이 직접 확인 — 해당 테스트 하나만 `assert None == '새 요약'`로 실패, 나머지 7개 통과, 복원 후 68 passed·임시 흔적 0)
retro: skipped (fg-next all 자동 진행 — 학습은 run.md, 승급은 추후 fg-learn)
docs updated: CONTEXT.md(버전 기록 항목 갱신) · ADR 260805-214733
