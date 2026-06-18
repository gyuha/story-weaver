<!-- forge-slug: storyweaver-design-docs -->
<!-- task: 1 -->
<!-- tdd: off -->
# StoryWeaver 기획·설계 문서 풀세트 작성

## Goal / Non-goals
- Goal: 기존 `기획.md`를 정교화하고, AI 웹소설 창작 SaaS "StoryWeaver"를 실제로 개발 착수할 수 있는 수준의 기획·설계 문서 풀세트(6종)를 `docs/`에 작성한다.
- Non-goals: 실제 코드 구현, 인프라 프로비저닝, 디자인 시안(UI 목업), 19금 성인물 지원 설계, MVP 비포함 기능(Plot Architect·분석·관계도)의 상세 구현 설계.

## Source of truth
- Glossary terms: 작품, World Bible, 엔티티 카드, 타임라인 상태, 씬, 씬-엔티티 링크, 메모리, 모델 스위칭 — `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/0001-python-backend-react-frontend.md`, `.forge/adr/0002-hybrid-memory-architecture.md`, `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`
- Definition of Done: `docs/` 아래 6개 문서가 모두 존재하고, 서로 모순 없이 ADR·용어집과 일치하며, 각 문서가 자체 슬라이스 완성 기준을 충족한다.

## 확정된 핵심 결정 (그릴링 합의)
- 제품 성격: 상업용 SaaS (멀티테넌시·비용구조·저작권 진지하게 설계)
- MVP 범위: World Bible + 메모리(RAG) + Smart Editor 3종만. Plot Architect·분석·관계도·이미지생성은 v2+.
- 모델 전략: 상용 API 하이브리드 + 전체이용가 수위 (ADR-0003)
- 스택: Python(FastAPI)+LangChain/LlamaIndex 백엔드, React/TypeScript 프론트 (ADR-0001)
- 메모리: 정형 카드 + 벡터(pgvector) + 씬-엔티티 링크 하이브리드 (ADR-0002)

## Work slices
- [ ] S1. PRD v2 작성 (`docs/PRD.md`) — 기존 `기획.md`를 정교화: 섹션번호 중복 수정, 기능 우선순위(MVP/v2+ 명시), 비기능 요구사항(비용 한도·지연시간·저작권·데이터주권), 비목표를 포함 — 완성 기준: `기획.md`의 모든 기존 항목이 누락 없이 반영되고, MVP 3종과 v2+ 기능이 표로 구분되며, 비기능 요구사항 섹션이 존재한다.
- [ ] S2. 시스템 아키텍처 문서 (`docs/architecture.md`) — Python 백엔드/React 프론트 컴포넌트 구성, 데이터 흐름(집필→메모리검색→LLM스트리밍→저장), 멀티테넌시 경계, 외부 LLM API 연동·스트리밍 방식, 스택 이원화 리스크 — 완성 기준: 컴포넌트 다이어그램(텍스트/Mermaid)과 핵심 집필 요청의 end-to-end 데이터 흐름도가 포함되고 ADR-0001과 일치한다. (depends: S1)
- [ ] S3. World Bible 데이터 모델 (`docs/data-model.md`) — 엔티티 카드 스키마(인물/장소/사건/아이템), 타임라인 상태 모델, 씬-엔티티 링크, 작품→씬 계층, pgvector 임베딩 저장 구조 — 완성 기준: 핵심 엔티티의 필드/관계가 명세되고, "3화 사망 캐릭터" 상태 추적 시나리오가 이 모델로 표현 가능함을 보이며 ADR-0002와 일치한다. (depends: S1)
- [ ] S4. AI/RAG 파이프라인 설계 (`docs/ai-pipeline.md`) — 하이브리드 메모리 검색 흐름(링크+벡터+카드 병합), 작업별 프롬프트 전략(이어쓰기·인필링·문체변환·교정), 모델 스위칭 규칙, 토큰 비용 통제, 전체이용가 모더레이션 거절 처리 — 완성 기준: 각 집필 기능의 프롬프트 입력 구성과 모델 선택 규칙이 표로 명세되고 ADR-0002/0003과 일치한다. (depends: S3)
- [ ] S5. 이미지 생성 v2 설계 (`docs/image-generation.md`) — 캐릭터/장소 이미지 생성, 핵심 난제인 캐릭터 일관성 접근(레퍼런스+IP-Adapter/LoRA vs 시드+상세프롬프트) 비교, 전체이용가 수위 적용, World Bible 엔티티 카드와의 연동 — 완성 기준: 캐릭터 일관성 문제와 후보 해법의 트레이드오프가 정리되고 v2 위치가 명시된다. (depends: S1)
- [ ] S6. MVP 로드맵 (`docs/roadmap.md`) — MVP 3종을 마일스톤으로 분해, v2+ 기능의 순서, 각 단계 산출물과 검증 기준 — 완성 기준: MVP→v2 마일스톤이 순서대로 나열되고 각 마일스톤의 완료 정의가 있으며 S1~S5와 모순이 없다. (depends: S1)
