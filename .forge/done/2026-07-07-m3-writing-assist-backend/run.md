# RUN — M3: 집필 보조 백엔드(이어쓰기·인필링·지문/대사변환·문체변환·교정)

slug: m3-writing-assist-backend · task: 36 · executed: 2026-07-07 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 2단계(eco: sonnet 상한 + ECO 규율 주입): Prep 병렬(S1 프롬프트 조립기·S2 모델 티어 라우팅) → Endpoints(S3, S1+S2 의존).

## 계획대로 된 것

- **S1**: `assist` 도메인, `assemble_prompt()` — 5작업 각각의 공통 베이스+작업별 지시+메모리 주입 수준(이어쓰기/인필링/대사변환=풀세트, 대사변환은 인물 speech_style/sample_lines 추가 강조, 문체변환=경량, 교정=최소).
- **S2**: `tier_routing.py` — 작업→티어(4.1표) 매핑 + 티어별 클라이언트 분기(현재 단일 모델이라도 실제 코드 분기 존재).
- **S3**: 5개 SSE 엔드포인트, `chat_router.py`의 스트리밍 패턴 재사용. `correct`는 계획대로 메모리 검색 자체를 호출하지 않음(테스트로 고정). **이어쓰기 1건은 실 z.ai(GLM-4.6) 호출로 통과 확인**.

## 계획 대비 차이 (divergences)

1. **환경 버그 발견·수정(S2, 저장소 전체 영향)**: `.venv`가 `.python-version` 고정 없이 Python 3.14로 빌드되어 있었고, `langchain_core`의 pydantic v1 shim이 3.14에서 내는 경고가 `filterwarnings=["error"]`로 fatal 처리되어 `langchain_core`를 임포트하는 모든 테스트(이 저장소 전체 — chat, 이번 assist)가 깨질 수 있는 상태였다. `api/.python-version=3.12` 추가 + `.venv` 재생성으로 해결, 기존 `tests/chat`(327개) 포함 전체 재확인. **이번 드라이브의 task 28-35는 langchain을 직접 쓰지 않아 우연히 이 문제를 만나지 않았을 뿐** — 발견 즉시 고쳐 향후 회귀 방지.
2. **S1·S2가 동시에 신규 `assist` 도메인을 만들며 `TaskType` enum을 한쪽만 정의** — S1이 S2가 먼저 만든 `tier_routing.py`의 `TaskType`을 재사용(중복 정의 없이 자연스럽게 병합).
3. **`correct`는 엔티티 참조가 없어 메모리 검색 자체를 스킵** — ai-pipeline.md 표의 "최소(name/aliases만)"를 "검색 호출 없음"으로 문자적으로 해석(교정 요청엔 대상 텍스트만 있고 엔티티 참조가 없으므로).

## 검증 (UAT)

- api: 직접 `.venv` Python 버전 확인(3.12.12) + `task test` 전체 재실행(764 passed, 1 skipped, 12 failed 전부 무관 baseline) + `tests/assist` 22개 전부 통과(**실 LLM 호출 1건 포함** `test_continue_real_llm_returns_nonempty_text`). `task lint`(신규 코드 0 에러).
- 계약: `task contract` → assist 5개 경로 확인. web: typecheck/lint/test(96) 회귀 없음.
- DoD 충족: 이어쓰기 호출 시 메모리 컨텍스트 주입된 스트리밍 응답 확인(실 LLM), 대사변환이 speech_style/sample_lines 강조, 작업별 티어 분기 코드 존재.
