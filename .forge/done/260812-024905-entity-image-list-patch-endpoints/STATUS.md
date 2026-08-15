# STATUS — 설정 이미지 목록 조회와 대표 지정·시각 묘사 수정 엔드포인트
slug: entity-image-list-patch-endpoints
status: done
executed: 2026-08-12
completed: 2026-08-12
verified: yes (tdd 모드 — 슬라이스 테스트가 증거다: 신규 e2e 12건이 **실 DB와 실 HTTP 경로**(`ASGITransport`)를 거쳐 통과하고, 계획이 지정한 방어 넷을 각각 제거해 red를 확인했다(목록 테넌트 가드 · PATCH 테넌트 가드 · `isPrimary:false` 거부 · 없는 이미지 404). 대표 지정은 "불렸다"가 아니라 DB를 다시 읽어 이전 대표의 `is_primary`가 false가 됐는지를 단정한다.
retro: skipped (fg-next all 자동 드라이브 — 학습은 run.md에 남고 승급은 추후 fg-learn)
docs updated: none
