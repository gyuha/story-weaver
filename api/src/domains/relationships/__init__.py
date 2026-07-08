"""relationships 도메인 — 캐릭터 관계도 (v2-C, plan.md).

자체 테이블은 두지 않는다: S1은 worldbible 엔티티의 ``attributes.relations``를 그대로
그래프 엣지로 옮기고, S2는 timeline의 ``TimelineState``에 ``relation_to_<entity_id>``
state_key 관례(새 테이블 없이 기존 key/value 컬럼 재사용)로 기록된 시점별 관계 변화를
엣지에 반영한다 — worldbible·timeline·manuscript 도메인이 이미 확립한 서비스 메서드만
재사용해 조회한다.
"""
