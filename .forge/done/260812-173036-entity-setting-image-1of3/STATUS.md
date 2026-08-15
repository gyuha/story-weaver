# STATUS — 설정 이미지 (1/3): 저장 기반 · entity_images 테이블 · 이미지 템플릿 카탈로그 16개
slug: entity-setting-image-1of3
status: done
executed: 2026-08-12
completed: 2026-08-12
verified: yes (2026-08-12 17:2x에 DoD 4항목 전부 충족 — 쿼터가 회복된 뒤 `python3 scripts/generate_template_samples.py`를 재실행해 **샘플 16/16 완성**(마지막 `ink-item`은 한 번 TimeoutError로 실패해 한 번 더 돌렸다). 실측: 개수 16, 총 556KB, 최대 파일 52,120 bytes로 `check-added-large-files --maxkb=1000`을 개별 파일 전부 통과, `file -b`로 16장 전부 실제 JPEG임을 확인. 앞서 확인한 나머지 3항목은 아래 원문 그대로 유효하다.
retro: skipped (fg-next all 자동 드라이브 — 학습은 run.md에 남고 승급은 추후 fg-learn)
docs updated: none
