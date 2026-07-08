"""conflicts 도메인 — 설정 충돌 자동 감지 (v2-B, data-model.md 8장).

같은 엔티티의 같은(예약) ``state_key``에 대해 시점(``global_seq``)이 역행하는 모순값을
1차 SQL/파이썬 규칙으로 탐지한다("3화 사망 → 10화 등장"). 자체 테이블은 두지 않고
timeline(``TimelineState``)·manuscript(``global_seq``)·worldbible(엔티티 이름) 도메인이
이미 확립한 서비스 메서드만 재사용해 조회한다 — 새 ORM 모델/리포지토리가 필요 없다.
"""
