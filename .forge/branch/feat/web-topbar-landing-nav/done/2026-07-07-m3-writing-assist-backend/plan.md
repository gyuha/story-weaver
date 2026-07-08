<!-- forge-slug: m3-writing-assist-backend -->
<!-- task: 36 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
# M3 — 집필 보조 백엔드(이어쓰기·인필링·지문/대사 변환·문체 변환·교정)

`ai-pipeline.md` 3·4장. M2(메모리 검색, task 34)에 의존. `chat` 도메인의 LLM 프로바이더 호출 레이어(`ports.py`/`llm_client.py`/`llm_factory.py`)는 재사용하되, `conversations`/`messages` 스키마는 재사용하지 않는다(범용 대화용이라 scene_id/작업종류 개념이 없음 — 탐색 확인).

## 목표 / 비목표

- 목표: 5개 작업(이어쓰기/인필링/지문·대사변환/문체변환/교정) 각각의 엔드포인트. 공통 베이스+작업별 지시로 프롬프트 조립(3.1). 메모리 검색 결과(task 34) 주입 수준을 작업별로 다르게(이어쓰기·인필링=풀세트, 변환=경량, 교정=최소). 작업별 모델 티어(저비용/고품질, 4.1 표)에 따라 `chat`의 프로바이더 레이어로 호출. 스트리밍(SSE) 응답.
- 비목표: 실제 저비용/고품질 "두 개의 서로 다른 모델"(현재 프로바이더는 GLM 단일 — 4.1의 티어 분기 "구조"는 만들되, 이 작업에서는 동일 모델을 두 티어에 매핑해도 무방, 실제 이종 모델 조합은 모델 평가 슬라이스 소관/미결정). rate/budget/모더레이션/캐싱(각각 task 39-41). 동적 업데이트(task 38).

## 진실의 출처

- Glossary terms: 없음(구현).
- Related ADRs: `.forge/adr/0002-hybrid-memory-architecture.md`, `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`.
- 코드 사실: `chat/ports.py`(`AbstractLLMPort`)·`llm_client.py`(`LLMClient`, langchain-litellm)·`llm_factory.py`(`ProviderFactory`)가 재사용 가능한 LLM 호출 레이어(탐색 확인). `conversations`/`messages` 모델은 이 작업과 무관, 건드리지 않는다. LLM 활성 설정: `LLM_PROVIDER=openai_compatible`(z.ai GLM-4.6) — 실 호출 가능.
- Definition of Done: 커서 위치에서 이어쓰기를 호출하면 메모리 컨텍스트가 주입된 후보가 스트리밍으로 온다. 지문/대사 변환이 인물의 `speech_style`/`sample_lines`를 반영한다(정성 확인). 작업 종류에 따라 티어 분기가 코드상 존재함을 테스트로 확인. `task lint`/`task test` 통과.

## 작업 조각

- [ ] S1. 프롬프트 조립기 (TDD) — completion criterion: 작업종류(enum) → (공통 베이스 + 작업별 지시 + 메모리 주입 수준) 조립 함수. 5개 작업 각각의 시스템 프롬프트 골자(3.1 표) 구현. pytest로 각 작업의 조립 결과에 필수 요소(수위 준수 문구, 메모리 컨텍스트 슬롯 등) 포함 확인.
- [ ] S2. 모델 티어 라우팅 (TDD) — completion criterion: 작업종류→티어(저비용/고품질) 매핑 테이블(4.1) + `chat`의 `ProviderFactory` 재사용해 티어별 호출 분기 구조(현 단계는 동일 프로바이더/모델이라도 분기 코드 경로는 실재). pytest.
- [ ] S3. 5개 작업 엔드포인트 (TDD) — completion criterion: `POST /api/v1/works/{work_id}/scenes/{scene_id}/assist/{continue|infill|dialogue|style|correct}` — 요청(커서 텍스트/선택 블록 등 작업별 입력)+메모리 검색(task 34) 호출+프롬프트 조립+SSE 스트리밍 응답. pytest(fake LLM로 유닛), 그리고 최소 1개 작업(이어쓰기)은 실 LLM 호출 통합 테스트 1건 포함(z.ai 키 사용, 응답이 비어있지 않음만 확인 — 정확한 내용 어설션은 안 함).
- [ ] S4. 검증 — completion criterion: `task lint`/`task test` 통과, `task contract`. (depends: S1-S3)
