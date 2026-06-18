# 2026-06-18 — StoryWeaver 기획·설계 문서 풀세트(6종) 작성

## Plan vs actual
- What went as planned:
  - 6개 슬라이스(S1~S6) 전부 완료, 교차검증 `allComplete: true`. 워크플로우 7에이전트·약 448k 토큰·약 12.5분.
  - 의존성 순서(PRD 선행 → data-model → ai-pipeline, 종합 roadmap) 준수. 비목표(19금·MVP 비포함 기능) 침범 없음.
  - 핵심 차별점인 상태추적/충돌탐지를 `global_seq + timeline_states + scene_entity_links`로 개념 SQL·규칙·Mermaid까지 입증(부활/회귀 장치 포함), MVP=기록·표시 / v2=자동탐지 분리.
- Divergences (모두 경미, 치명적 아님 — 용어·표현 정합성):
  1. "Smart Editor 3종" 라벨이 대분류 3종(World Bible/메모리/Smart Editor)을 뜻하나 Smart Editor 내부 기능 수(4~5개)와 충돌하게 읽힘. → PRD/roadmap 본문을 "3개 핵심 영역"으로 정정.
  2. CONTEXT의 씬 계층 서술(`작품→시놉시스→에피소드→…`) ↔ data-model ER(시놉시스=작품 직속 1:1 속성)이 어긋남. data-model 쪽이 합리적. → CONTEXT 정정.
  3. CONTEXT '메모리' _Avoid_의 'RAG'를 설계 문서가 사용. 회피 지침은 사용자 대면 한정이라 실질 위반 아님. → CONTEXT에 "내부 설계 문서 예외" 명시.

## Learnings
- Do differently next time:
  - 용어집(CONTEXT)에 계층/관계를 서술할 때, 데이터 모델이 그 계층을 1:1 속성으로 풀 수도 있는 항목(예: 시놉시스)은 "계층 단계"와 "속성"을 grilling 단계에서 미리 구분해 둘 것 — 사후 정합성 정정이 줄어든다.
  - "N종" 같은 수량 라벨은 대분류와 하위 기능 수가 충돌할 수 있으니, 대분류엔 "영역", 하위엔 "기능"처럼 어휘를 분리해 처음부터 쓸 것.
  - 워크플로우 교차검증 에이전트에 schema(파일별 meetsCriterion + inconsistencies)를 주니 경미한 정합성 문제까지 구조적으로 잡혀 retro 입력이 깔끔했다 — 문서 생성 류 작업에 재사용할 패턴.

## Doc updates
- CONTEXT.md promotion: 씬(시놉시스 계층 정정), 메모리(RAG 회피어 예외 한 줄) — 2건 정정
- 문서 본문 정정: PRD.md·roadmap.md "3종→3개 핵심 영역" 라벨 (용어집 아님, 산출물 정정)
- ADR added: none (핵심 결정은 기존 ADR-0001~0003에 이미 존재, 신규 트레이드오프 없음)
