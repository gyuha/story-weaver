"""timeline 도메인 — 타임라인 상태(Timeline State)·씬-엔티티 링크(Scene-Entity Link).

data-model.md 4·5장의 "상태/링크(State & Link)" 축. 두 테이블 모두 manuscript(scenes)와
worldbible(entities) 양쪽을 참조하므로 어느 기존 도메인에 얹어도 한쪽은 도메인을 넘는
FK가 된다 — FK는 테이블명 문자열로 선언되어 ORM 모델 import 없이 걸 수 있으므로(works를
참조하는 기존 도메인들과 동일 패턴) 새 도메인으로 독립시킨다. work_id/entity_id/scene_id는
모두 ID 참조만 한다(도메인 간 직접 모델 import 금지).
"""
