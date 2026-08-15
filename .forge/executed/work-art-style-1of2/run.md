# RUN — 작품 화풍 (1/2): 저장·카탈로그 축 분리·프롬프트 조립·엔드포인트

slug: work-art-style-1of2 · task 80 · part 1/2 · tdd: on
실행: 2026-08-13 · Dynamic Workflow(에이전트 5개 — `api-backend-builder` 3 + `llm-pipeline-engineer` 2, eco→sonnet) + 직접 실행(S6 통합 검증·스위트 결함 수정)

## 슬라이스별 결과

- S1 `works` 화풍·톤 컬럼 + `0006` 마이그레이션 — ✅ 계획대로
- S2 카탈로그 축 분리 — ⚠ 계획대로 착지, 버린 어휘가 계획의 예상보다 많다(아래 발산 1)
- S3 프롬프트 조립 변경 — ✅ 계획대로
- S4 화풍 카탈로그·작품 화풍 API — ⚠ 계획대로 착지, `/image-templates`를 **완전 삭제**로 결정
- S5 SSE 계약 변경 + 미지정 거부 — ⚠ 계획대로 착지, 거부를 **409 Conflict**로 정함
- S6 계약 재생성 + 검증 — ⚠ 게이트 통과, 단 **스위트를 무너뜨리는 결함 하나를 발견해 고쳤다**(아래 발산 2 — 이 실행의 가장 중요한 사건)

## 계획의 유일한 품질 리스크가 닫혔다 — 시각적 증거로

계획이 "이 작업의 유일한 품질 리스크"로 적어둔 것은 *"기계적으로 쪼갠 조각을 다시 이으면 문장이 어색해질 수 있다"* 였다. **실측 결과 자연스럽다.**

조립된 프롬프트(실제 출력):
```
이십 대 여성 검객, 칠흑색 장발. 전체적으로 짙푸른 자톤, 종이 질감.
수묵화풍 삽화, 먹선과 옅은 채색, 상반신 반신 구도, 차분한 표정, 흰 배경, 인물 한 명만, 고화질 설정화
```
중복 어구도 쉼표 뭉침도 없다. 그리고 **실제로 1장 생성해 눈으로 확인했다**(쿼터를 아껴 1회만): 수묵화 화풍(먹선·번짐)·반신 구도·흰 배경이 모두 나왔고, **작품 톤이 확실히 반영됐다** — `"짙푸른 자톤"`이 의상 전체에, `"종이 질감"`이 배경에 보인다. 잃은 `"흰 한지 배경"`을 **톤 한 줄이 실제로 메운다는 시각적 증거**이며, 이것이 ADR이 설계한 회복 경로 그대로다.

## 발산

1. **S2가 버린 어휘가 계획의 예상보다 많다.** 계획은 화풍별 배경 차이만 포기하라고 지시했으나, 실제로는 화풍 조각을 하나로 통일하는 과정에서 유형별 기법 차이도 함께 버렸다 — `oil`의 `대기 원근`(장소)·`군상 구도`(사건), `photo`의 `스튜디오 조명`(아이템), `고화질` 접미사의 표기 차이 등. 최종 카탈로그는 화풍 4조각 + 구도 4조각 = **8조각**이다(원래 16개 통짜).
   **그리고 여기 실질적 손실이 하나 있다**: `oil`은 원래 인물·아이템에서 `"어두운 단색 배경"`이었는데(고전 유화 초상의 관례) 이제 구도 조각의 `"흰 배경"`/`"완전한 흰 배경"`을 받는다. **그래서 커밋된 `oil-character.jpg`·`oil-item.jpg` 견본은 어두운 배경인데 실제 생성은 흰 배경이 나와 견본이 사실과 어긋난다.** 2/2의 화풍 선택 화면이 그 견본을 보여주므로 작가가 오해할 수 있다 — 후속 후보로 남긴다(아래).
2. **스위트를 무너뜨리는 결함을 발견해 고쳤다 — task #76이 남긴 잠재 결함이 이 마이그레이션으로 드러났다.** S5가 "환경 이슈, 내 코드 결함 아님"으로 보고한 간헐적 실패를 그대로 믿지 않고 전체 스위트를 돌려 보니 **16 failed · 150 errors**였다(기준선은 1065 passed · 기존 실패 12건). 원인을 추적한 결과:
   - `tests/image_generation/test_entity_image_repository.py`(task #76이 작성)가 `command.downgrade(cfg, "0004_chapter_versions")` 후 **`command.upgrade(cfg, "0005_entity_images")`로 하드코딩된 리비전으로 복원**한다. 그때는 0005가 head였다. **0006이 추가된 순간 이 테스트는 공유 dev DB를 0005에 갇히게 만든다** — 그러면 `works`를 만지는 이후 모든 테스트가 `column "art_style_id" does not exist`로 무너진다.
   - 확인 방법: 스위트 실행 후 `uv run alembic current` → `0005_entity_images`, `information_schema.columns`에 `art%` 컬럼 0개를 직접 관측했다.
   - **고친 것**: 두 마이그레이션 왕복 테스트(#76의 것과 S1이 새로 만든 것) 모두 ① 복원을 `"head"`로 바꾸고 ② `try`/`finally`로 감싸 단정 실패·중단에도 복원이 보장되게 했다. S1의 테스트는 `downgrade`와 `upgrade` **사이에서 단정**하고 있어 그 단정이 실패하면 DB가 갇히는 같은 함정을 갖고 있었다.
   - 결과: **1111 passed · 12 failed(기존)** · errors 0. 실행 후 `alembic current`가 head를 유지한다.
   - **일반화할 교훈**: 공유 DB에 실제 마이그레이션을 돌리는 테스트는 **절대 하드코딩된 리비전으로 복원하지 말 것**(`"head"`를 쓴다), 그리고 **복원은 항상 `finally`에** 둘 것. 이 저장소는 마이그레이션이 계속 늘어나므로 이 함정이 매번 재발한다.
3. **S4가 `/image-templates` 엔드포인트를 완전 삭제**했다(유지가 아니라). 화풍이 빠진 뒤 남는 것은 유형별 구도뿐이고 그것은 작가가 고르는 대상이 아니므로(템플릿이 하나로 결정된다) 공개할 값이 없다는 판단. 대신 `GET /api/v1/art-styles`와 `GET /api/v1/art-styles/{style_id}/samples/{entity_type}`이 생겼다. **2/2는 `/image-templates`를 부를 수 없다** — S1이 확인할 사항으로 계획에 이미 적혀 있다.
4. **S5가 화풍 미지정 거부를 409 Conflict로 정했다**(422가 아니라). 근거: 422는 "요청 바디가 잘못됐다"는 신호인데 실제 문제는 요청이 아니라 **작품의 현재 상태**이고, 게이트웨이 429의 한도 안내와도 명확히 구분된다. 기존 `core.exceptions.ConflictError`를 재사용해 새 예외 클래스를 만들지 않았다. 응답 본문은 사용자 대면 한국어(`"작품의 화풍이 정해지지 않았습니다. 먼저 이미지 스타일을 정해 주세요."`)다.
5. **`templateId`를 보내는 옛 요청은 무시**한다(422 거부 아님). `GenerateEntityImageRequest`에서 필드를 제거하고 pydantic의 `extra="ignore"` 기본 동작에 맡겼다 — 추가 코드 0줄. 2/2 배포 전까지 옛 웹이 계속 보내는데 거부하면 로그가 시끄러워진다는 계획의 우려를 근거로 삼았다.
6. **`EntityImage.template_id` 컬럼은 스키마 변경 없이 값만 재정의**했다 — `f"{art_style_id}-{entity_type}"`(예 `ink-character`)로, 옛 템플릿 id와 **완전히 같은 포맷**이다. ADR의 "과거는 이미 안전하다"(생성 근거 보존) 약속이 그대로 유지된다. 실측 확인: 새로 생성한 행의 `template_id`가 `ink-character`다.
7. **S1이 `art_style_note`를 nullable로 정했다**(`''` 기본값이 아니라). `art_style_id`와 대칭이라 "미지정 = null" 한 규칙으로 단순해지고, 조립 로직이 공백/None을 함께 "없음"으로 다루므로 동작 차이가 없다. 그리고 두 필드를 `WorkCreate`/`WorkUpdate`/`WorkResponse`에 **노출하지 않았다** — S4가 전용 엔드포인트를 만들므로 중복 경로가 된다.
8. **계획서의 사실 오류 하나**: "기존 작품 4건"이라고 적었으나 실 DB에는 **14건**이었다(S1이 직접 조회해 확인). 결론(전부 null로 남는다)에는 영향이 없다.
9. **S2가 샘플 재생성 스크립트(`api/scripts/generate_template_samples.py`)를 새 구조에 맞춰 고쳤다** — 소유 파일 목록에 없었지만 고치지 않으면 샘플을 다시 만들 수 없게 된다. 화풍×구도 이중 루프로 16개 파일명을 조립하며 `sample_subject`는 구도(유형) 쪽에 4개만 두고 재사용한다(원본은 같은 유형이면 화풍 4개가 값이 동일했다). **네트워크 호출로 실행 검증은 하지 않았다**(쿼터) — 다음에 샘플을 다시 만들 때 처음 확인된다.
10. **의도된 중간 파괴 상태가 두 번 있었다.** S2가 옛 카탈로그 API를 제거한 순간 라우터가 `ImportError`가 났고, S3가 `build_entity_image_prompt` 시그니처를 바꾼 순간 라우터 호출부가 깨졌다. 둘 다 S4·S5가 해소했고 최종 상태는 클린이다(ruff·mypy 통과). ADR이 SSE 계약 변경에 대해 같은 패턴을 "의도된 중간 상태"로 명시해 둔 것과 동일하다.

## 방어를 깨뜨려 red를 확인한 것

다섯 에이전트 전원이 수행했다. 계획이 지정한 넷이 모두 포함된다:

- **S1** — 마이그레이션에 `server_default="ink"`를 임시로 넣어 백필을 재현 → `test_existing_work_stays_null_across_migration_roundtrip`이 `'ink' is None`으로 red.
- **S2** — ① `compose_prompt_suffix`의 `ValueError` 두 곳을 무력화 → 해당 테스트가 `AttributeError`로 red ② `_load_catalog`의 pydantic 검증을 우회 → `test_broken_catalog_json_raises_on_load`가 `DID NOT RAISE`로 red.
- **S3** — 시각 묘사 우선 로직을 "항상 카드 필드"로 축소 → 8건 red, 카드 필드가 시각 묘사를 대체하지 못하는 것을 diff로 직접 목격.
- **S4** — `WorksRepository.get_owned`의 `user_id` 필터를 제거 → 교차 테넌트 GET/PUT이 404에서 200으로 넘어감(가드가 실제로 막고 있었다는 확인).
- **S5** — 미지정 거부 가드를 `art_style_id or "ink"`로 바꿔 제거 → `test_unstyled_work_rejects_generation_with_409`가 200으로 red.

**그리고 테스트가 보는 명제를 목표에 맞췄다** — S2의 조립 테스트는 "함수가 불렸다"가 아니라 **결과 문자열이 화풍 어휘와 구도 어휘를 모두 포함하고 중복이 없는지**를 화풍4×유형4 전 조합으로 단정한다.

## 통합 검증 결과 (S6)

- `uv run ruff check .` → All checks passed · `uv run mypy src` → **171 files, no issues** (S4가 보고한 F821 2건·mypy 4건은 S5가 해소했음을 확인).
- `uv run pytest -q` → **1111 passed · 12 failed · 1 skipped**, 커버리지 **80.40%**(≥70). 12건은 `TestMakefileHotReload` 9 + `TestMakeMigrate` 3으로 `Makefile` 부재에 의한 기존 무관 실패이며, task #76 실행에서 `git stash`로 무관함을 입증한 동일 집합이다. **errors 0** — 위 발산 2를 고친 결과다.
- `alembic upgrade head` → `0006_work_art_style (head)`, 스위트 실행 후에도 head 유지.
- `docs/openapi.json` 갱신: `/api/v1/art-styles`(get) · `/api/v1/art-styles/{style_id}/samples/{entity_type}`(get) · `/api/v1/works/{work_id}/art-style`(get, put)가 추가되고 `/image-templates`가 사라졌다. 총 경로 62개.
- **실 앱(`main:app`, 포트 8020) + 실 JWT로 DoD 5항목 전부 왕복** — JWT는 앱 자신의 `create_access_token`으로 발급했다(새 계정을 만들지 않고 데이터도 남기지 않는 방법, task 77·79에서 검증됨):
  ① 화풍 카탈로그 4개 + 각 화풍의 유형별 견본 URL 4개, `ink`의 인물·장소·아이템 견본이 실제 `image/jpeg` 200
  ② `PUT` → `GET` 왕복: `{"artStyleId":"ink","artStyleNote":"전체적으로 짙푸른 자톤, 종이 질감"}` 그대로
  ③ SSE 생성 성공 — 단계 이벤트가 `prompt → image → description` 순, `final_prompt`에 화풍·구도·톤 어휘 전부, `visual_description` **1966자**, 파일 **824,052 bytes**, `llm_call_logs` 두 행(`image_generation` 12,939ms · `image_description` 44,964ms), 첫 이미지 자동 대표
  ④ 화풍 미지정 작품의 생성이 **409**와 한국어 안내로 거부
  ⑤ 남의 `work_id`는 GET·PUT 모두 **404**, 없는 화풍 id는 **422**

## 후속 작업 후보

- **`oil` 견본 2장이 사실과 어긋난다**(위 발산 1). `oil-character.jpg`·`oil-item.jpg`는 어두운 배경으로 생성됐는데 지금 조립은 흰 배경을 낸다. 2/2의 화풍 선택 화면이 그 견본을 보여주므로 작가가 오해한다. **선택지 둘**: (a) 그 2장을 재생성한다(쿼터 2장) (b) 구도 조각에서 배경을 빼고 화풍별 배경을 되살린다(축 분리를 부분적으로 되물림 — 권하지 않는다). (a)가 맞다고 본다.
- **샘플 재생성 스크립트의 실행 검증**(위 발산 9) — 로직만 고쳤고 실제로 돌려보지 않았다. 위 항목의 `oil` 2장 재생성이 그 검증을 겸한다.
- **마이그레이션 왕복 테스트의 함정을 저장소 규약으로 못박기**(위 발산 2). `api/CLAUDE.md`에 "공유 DB에 실제 마이그레이션을 돌리는 테스트는 `"head"`로 복원하고 `finally`에 둔다"를 한 줄 추가할 후보다 — 이 저장소는 마이그레이션이 계속 늘어난다.
- `docs/image-generation.md`가 여전히 화풍·구도가 한 세트인 옛 모델을 기술한다 — ADR `260813-110724`이 그것을 무효화했으므로 문서 갱신 후보.
