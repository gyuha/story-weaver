# STATUS — 작품 화풍 (1/2): 저장·카탈로그 축 분리·프롬프트 조립·엔드포인트
slug: work-art-style-1of2
status: executed
executed: 2026-08-13
verified: yes (DoD 5항목을 실 앱·실 JWT로 전부 왕복 확인 — ① 화풍 카탈로그 4개 + 각 화풍의 유형별 견본 URL, `ink`의 인물·장소·아이템 견본이 실제 `image/jpeg` 200 ② 작품 화풍 `PUT`→`GET` 왕복이 그대로 ③ SSE 생성 성공: 단계 이벤트 `prompt → image → description`, `final_prompt`에 화풍·구도·톤 어휘 전부, `visual_description` 1966자, 파일 824,052 bytes, `llm_call_logs` 두 행(12,939ms·44,964ms), 첫 이미지 자동 대표 ④ 화풍 미지정 작품의 생성이 **409**와 한국어 안내로 거부 ⑤ 남의 `work_id`는 GET·PUT 모두 404, 없는 화풍 id는 422. JWT는 앱 자신의 `create_access_token`으로 발급해 새 계정·잔여 데이터를 만들지 않았다.
  게이트: `ruff check` 클린 · `mypy src` **171파일 no issues** · `pytest -q` **1111 passed · 12 failed · 1 skipped**, 커버리지 **80.40%**(≥70) · `alembic upgrade head` → `0006_work_art_style (head)`이고 스위트 실행 후에도 head 유지 · `docs/openapi.json` 갱신(신규 4경로, `/image-templates` 삭제, 총 62). 12건은 `Makefile` 부재로 인한 기존 무관 실패(task #76에서 `git stash`로 입증한 동일 집합)이며 **errors 0**이다.
  다섯 에이전트 전원이 방어 제거 red 확인을 수행했고 계획이 지정한 넷이 모두 포함된다(백필 재현 · 카탈로그 검증 우회 · 시각 묘사 우선 제거 · 교차 테넌트 가드 제거 · 미지정 거부 제거). 상세는 `run.md`.
  **계획이 "유일한 품질 리스크"로 적어둔 항목을 시각적 증거로 닫았다** — 쪼갠 조각을 다시 이은 프롬프트가 자연스럽고(중복·쉼표 뭉침 없음), 실제로 1장 생성해 눈으로 확인했다: 수묵화 화풍·반신 구도·흰 배경이 모두 나오고 **작품 톤(`짙푸른 자톤`·`종이 질감`)이 의상과 배경에 확실히 반영**됐다. 잃은 `"흰 한지 배경"`을 톤 한 줄이 메운다는 ADR의 설계가 실증됐다.
  **실행 중 스위트를 무너뜨리는 결함 하나를 발견해 고쳤다** — task #76의 마이그레이션 왕복 테스트가 하드코딩된 리비전(`0005_entity_images`)으로 복원해, `0006`이 추가되자 공유 dev DB를 0005에 갇히게 만들었다(실측 **16 failed · 150 errors**, `alembic current`와 `information_schema.columns`로 직접 관측). 두 왕복 테스트를 `"head"` 복원 + `try`/`finally`로 고쳐 **errors 0**으로 돌렸다.)
retro: pending

## 사람이 알아야 할 것 — `oil` 견본 2장이 사실과 어긋난다
축 분리로 `oil`의 배경이 `"어두운 단색 배경"` → 구도 조각의 `"흰 배경"`으로 바뀌었는데, 커밋된 `oil-character.jpg`·`oil-item.jpg`는 **어두운 배경으로 생성된 옛 견본**이다. 2/2의 화풍 선택 화면이 그 견본을 보여주므로 작가가 오해할 수 있다. 권고: 그 2장을 재생성한다(쿼터 2장, 샘플 스크립트의 실행 검증도 겸한다). `run.md`의 후속 작업 후보에 근거와 대안이 있다.
