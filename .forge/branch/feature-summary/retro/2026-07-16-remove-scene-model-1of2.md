# 2026-07-16 — 백엔드 Scene 계층 제거, 화(Chapter)를 본문 최소 단위로 (part 1/2)

## Plan vs actual
- What went as planned: 최종 산출물은 DoD 충족(독립 검증됨) — `scenes` 테이블·기능적 `scene_id` 경로 소멸, 8개 도메인 chapter 스코프화, 마이그레이션 `0011_chapter_absorbs_scene`, `docs/openapi.json` 재수출. `task lint`(ruff+mypy 159파일)·`task test`(910 pass·커버리지 86.71%) green, 앱 부팅 56라우트·scene 경로 0·chapter 스코프 12경로.
- Divergences:
  - **워크플로우가 S3에서 중단.** 계획의 슬라이스 의존성 그래프(`S3 depends: S1,S2`)가 "route 테스트는 FastAPI 앱 import 그래프를 공유한다"를 놓침 — S1이 모델에서 `Scene`을 지운 뒤 소비 계층(manuscript/timeline/dynamic_update 등 repository·service·router)이 여전히 `Scene`을 import해, 어떤 route 슬라이스도 pytest collection 단계에서 ImportError로 검증 불가. S3 에이전트가 이를 정확히 진단하고 스코프 임의 확장 없이 보고 → 직렬 루프 중단(S4·S5·S6 슬라이스 미실행).
  - **적대적 검토 4렌즈**가 근본원인(반쪽 리팩터: 모델만 지우고 소비 계층 미이관 → 앱 전체 import 붕괴, mypy 17에러, openapi 미재수출)의 critical/fix-needed 18건 적발 → **수정 에이전트가 S3잔여+S4+S5+S6를 단일 패스로 흡수 완료**(54파일 변경). per-slice TDD(test-first) 규율은 이 흡수 범위에서 상실 — 기존 테스트 26파일을 새 계약에 맞게 재작성(테스트가 구현을 따라간 형태). DB 기반 route/격리 테스트라 무의미 조작은 어렵지만, 재작성 테스트의 행위 고정력은 향후 별도 점검 여지.
  - 파괴적 마이그레이션이 dev `app_db` 리셋(`TRUNCATE chapters CASCADE`) — ADR 승인.
  - `pyproject.toml`에 langchain_core/pydantic-v1/Python3.14 UserWarning ignore 1건 추가(환경 워크어라운드 — 로컬 venv 3.14 vs 타깃 3.12; 게이트 약화 아님, 알려진 무해 upstream 경고만 침묵). 근본 해결은 타깃 3.12에서 테스트 구동.
  - 사전존재 테스트 실패 15건(Makefile 참조 12·real_llm 크리덴셜 3) 미해결 — 이번 변경과 무관(독립 확인).

## Learnings
- Do differently next time:
  - **밀결합 풀스택 리팩터는 계층별(model→service→router) per-slice 게이트로 쪼개면 중간 halt한다.** route/통합 테스트는 앱 import 그래프를 공유하므로, 소비 계층이 다 이관되기 전엔 개별 슬라이스를 검증할 수 없다. → **coarse 웨이브 + 최종 홀리스틱 게이트**, 또는 **수직 end-to-end 슬라이스**(한 도메인을 모델~라우터~테스트까지 한 번에)로 설계할 것. part 2/2가 바로 이 교훈을 적용해 halt 없이 완주함(→ 2026-07-16-remove-scene-model-2of2).
  - eco(sonnet 상한) + TDD + 적대적 검토 조합은 반쪽 상태를 잡아내 결과적으로 DoD를 충족시켰으나, "review-fix가 4슬라이스를 흡수"하는 형태는 계획-실행 정합성이 낮다. 계획 단계에서 슬라이스 경계를 **import 그래프 기준**으로 그었다면 애초에 흡수가 불필요했을 것.
- 후속 작업 후보(다음 fg-ask): ① 화 요약 기능(원 요청, ADR 260716-17a가 리팩터 이후로 연기 — 실질적 다음 기능) · ② 죽은 `scenes` 필드 정리(`WorkSummary.scenes` 등 항상 0인 파생 통계, 백엔드 스키마+openapi 재수출+web 동반) · ③ 사전존재 테스트 15건 정리(Makefile 참조 테스트는 Taskfile 기준으로 재작성/삭제, real_llm 테스트는 크리덴셜 없을 때 skip 처리).

## Doc updates
- CONTEXT.md promotion: 씬(폐지)·화·부·시놉시스·타임라인 상태·씬-엔티티 링크(→화-엔티티 링크)·메모리·채팅·읽기 모드·편집 모드·버전 기록 — 화 기준으로 갱신(브랜치 델타 `.forge/branch/feature-summary/CONTEXT.md`, ADR 260716-17a가 이 회고 단계로 지시한 작업).
- ADR added: none (결정은 260716-17a에 기수록; 실행 중 삼박자[되돌리기 어려움+난해+트레이드오프] 신규 결정 없음).
