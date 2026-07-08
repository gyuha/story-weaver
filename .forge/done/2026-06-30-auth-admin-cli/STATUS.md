# STATUS — 회원 이메일 인증·관리자 권한 부여 CLI (api)
slug: auth-admin-cli
status: done
executed: 2026-06-30
completed: 2026-06-30
verified: yes (신규 8 테스트 green + 내 파일 ruff·mypy clean; 실 DB UAT — task verify-email→인증·멱등, grant-admin→admin 부여·멱등, 없는 이메일→exit 1, 인증 후 로그인 200. repo-wide task lint(7)·task test(12)는 PRE-EXISTING 결함[test_auth_flows 린트 nit·stale Makefile 테스트]으로 red — 이 작업 무관)
retro: skipped (fg-next all 자동 진행 — 학습은 run.md, 승급은 추후 fg-learn)
docs updated: none
