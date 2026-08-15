# RUN — 설정 이미지 (1/3): 저장 기반 · entity_images 테이블 · 이미지 템플릿 카탈로그 16개

slug: entity-setting-image-1of3 · task 76 · part 1/3 · tdd: on
실행: 2026-08-12 · Dynamic Workflow(에이전트 5개, `api-backend-builder`, eco→sonnet) + 직접 실행(템플릿 정의·샘플 생성·통합 검증)

## 슬라이스별 결과

- S1 이미지 저장 모듈 — ✅ 계획대로
- S2 `entity_images` 테이블 + 0005 마이그레이션 + 리포지토리 — ✅ 계획대로
- S3 카드 삭제 시 이미지 파일 정리 — ⚠ 계획대로 착지, 주입 방식이 계획의 가정과 달랐다(호출부 10곳 무수정)
- S4 이미지 템플릿 카탈로그 로더 — ✅ 계획대로
- S5 샘플 썸네일 16장 — ❌ **11/16** — 게이트웨이 레이트리밋(429)으로 5장 미생성
- S6 카탈로그·샘플·이미지 조회 엔드포인트 — ⚠ 계획대로 착지, 공개 응답에서 `prompt_suffix`를 뺐다
- S7 통합 검증 — ⚠ 게이트는 전부 통과, 단 S5 미완이 DoD의 한 항목을 남긴다

## 계획대로 된 것

- **TDD가 실제로 값을 했다.** 다섯 에이전트 전원이 "방어를 제거해 red가 되는지"를 실행해 보고했다. 계획의 검증 노트가 지목한 네 지점이 모두 확인됐다:
  - 경로 탈출 가드(`_resolve_under_root`의 `is_relative_to`)를 주석 처리 → `DID NOT RAISE ValueError`로 red.
  - 부분 유니크 인덱스를 DROP → 대표 이미지 중복 삽입이 통과함을 **영구 테스트로** 고정(`test_dropping_the_partial_unique_index_lets_the_violation_through`).
  - FK를 `ON DELETE CASCADE` 없이 재생성 → `ForeignKeyViolationError`로 red.
  - 교차 테넌트 가드(`works_service.get_work`) 제거 → 침입자가 소유자의 이미지 바이트를 200으로 읽음(red).
  - 파일 정리 호출 제거 → 파일이 디스크에 남아 red. **"삭제 함수가 불렸다"가 아니라 `Path.exists()`로 단정**했다 — 계획이 경계한 목 함정을 피했다.
- **S2의 red 확인이 자기 테스트의 실제 버그를 잡았다.** 인덱스 red-check 테스트의 초안이 `finally`에서 인덱스를 복구하기 전에 일부러 만든 중복 행을 지우지 않아 `CREATE UNIQUE INDEX`가 `UniqueViolationError`로 실패하며 **인덱스 없는 상태를 이후 테스트로 흘렸다**(전체 스위트를 함께 돌릴 때만 드러나는 순서 의존 버그). `finally`에 `DELETE`를 추가해 고쳤다.
- **병렬 슬라이스 중 저장소 전체 게이트를 돌리지 않는다는 지시가 유효했다.** S1·S4 에이전트가 각각 "전체 pytest에서 남의 파일이 실패하는 것을 봤지만 내 스코프 밖이라 두었다"고 보고했다 — `new-work-creation-wizard` 회고의 교훈(병렬 중 전체 검증은 오탐)이 그대로 재현되고, 그대로 막혔다.
- **도메인 경계를 지켰다.** `EntityImage`가 worldbible의 `Entity`를 import하지 않고 `entity_id`로만 참조하며 DB FK는 마이그레이션에만 있다. `ImageTemplate.entity_type`도 worldbible의 `EntityType`을 import하지 않고 같은 값의 자체 Literal로 뒀다.
- **ADR `260811-234512`의 핵심 제약이 스키마로 굳었다.** `visual_description`이 `entity_images` 테이블에 있고 `entities.attributes`에 없다 — 모델·마이그레이션 양쪽 독스트링에 그 이유(`_entity_content()`의 임베딩 오염)를 적었다.
- 통합 게이트: `ruff check` 클린 · `ruff format` 클린 · `mypy src` 169파일 클린 · `pytest` **1010 passed, 커버리지 80.28%**(≥70) · `alembic upgrade head` → `0005_entity_images (head)`.
- 실 DB에서 스키마 확인(`\d entity_images`): 부분 유니크 인덱스 `ix_entity_images_primary ... WHERE is_primary`와 `ON DELETE CASCADE` FK가 실제로 존재.
- 실 서버(`:8011`) `curl` 확인: 카탈로그 16개 · 유형별 정확히 4개씩 · 샘플이 실제 320×320 JPEG로 서빙 · 없는 샘플과 없는 template id 모두 404.

## 발산

1. **S5가 미완이다 — 게이트웨이가 이미지 생성을 레이트리밋한다. 이것이 이번 실행의 가장 중요한 발견이다.**
   연속 11장을 만든 뒤 `HTTP 429 Too Many Requests`가 나고, **60·120·180·240초 백오프 4회로도 풀리지 않았다.** 그 뒤 두 차례 더 재시도했으나 여전히 429다. 시간당·일일 쿼터로 보이며 대기 시간이 미지다. 결과: `photo-event` · `ink-item` · `webtoon-item` · `oil-item` · `photo-item` 5장이 없다.
   - 계획의 S5 완성기준("16개 각각의 샘플이 320px로 축소돼 커밋돼 있다")은 **충족되지 않았다.**
   - 다만 실패는 우아하다 — S6의 샘플 엔드포인트가 파일 없음을 404로 처리하고(실측 확인), 카탈로그는 16개를 그대로 돌려준다. 시간이 지난 뒤 `python3 scripts/generate_template_samples.py`를 다시 돌리면 있는 것은 건너뛰고 없는 5장만 채운다.
   - **이 제약은 ADR `260811-234511`의 실측 제약표에 없던 항목이고 2/3·3/3에 직접 영향이 있다.** 작가가 이미지를 연속으로 재생성하면 같은 벽에 부딪힌다. 2/3의 어댑터는 429를 "게이트웨이 혼잡"으로 사용자에게 정직하게 알려야 하고(시스템 오류로 위장하지 말 것), 3/3의 UI는 그 상태를 표시해야 한다. ADR 제약표에 429 항목을 추가할 후보다.
2. **S3의 주입 방식이 계획의 가정과 달랐고, 실제가 더 안전했다.** 계획은 "주입 지점이 바뀌면 `WorldBibleService(...)` 호출부를 전수 고쳐야 한다"고 가정했다. 에이전트가 `grep`으로 호출부 **10곳**(`assist_router` · `memory_router` · `worldbible_router` · `chat_router` · `dynamic_update_router`×2 · `conflicts_router` · `relationships_router` · `timeline_router` · 테스트 2곳)을 전수 확인한 뒤, 정리 함수를 **기본값이 있는 optional 4번째 파라미터**로 두어 **호출부를 하나도 고치지 않았다.** 그래서 "이미지 정리를 놓치는 호출부"가 구조적으로 생길 수 없다 — 계획이 상정한 수동 전수 수정보다 누락 위험이 낮다.
3. **S6이 공개 카탈로그 응답에서 `prompt_suffix`를 뺐다.** 무인증 엔드포인트의 노출 표면을 최소화하는 판단이며(응답은 `id`·`label`·`entityType`·`sampleUrl`), 프롬프트 조립이 백엔드이므로 프론트가 이 값을 알 필요가 없다 — 3/3의 배선에 영향 없음. 계획에 명시가 없던 결정이라 기록한다.
4. **S4의 `$comment` 처리는 불필요했다.** 계획이 "`$comment`가 검증을 깨뜨리지 않게 처리하라"고 했지만, 로더가 `data["templates"]`만 인덱싱하므로 최상위 키는 애초에 파싱 대상이 아니었다. 계획의 사실 오류 수준.
5. **`generate_samples.py`를 `scripts/generate_template_samples.py`로 옮겼다.** 처음 `assets/image-templates/`에 뒀더니 `ruff`가 11건을 잡았다(`T20` print 등). `pyproject.toml:156`에 `scripts/**`용 per-file-ignore가 이미 있어(`T20`·`ANN`·`S310`·`S603`·`S607` …) 설정을 새로 늘리는 대신 그 관례로 옮겼다. 계획에 없던 위치 결정.
6. **429 백오프 재시도를 스크립트에 추가했다.** 계획에 없던 코드지만 S5를 완주하려면 필요했다(결국 완주하지 못했으나, 재실행으로 채울 수 있는 형태는 갖췄다).
7. **`alembic/env.py`에 `image_generation.models` import를 추가했다** — 기존 도메인들과 같은 `try/except ImportError` 패턴. 계획에 명시되지 않았지만 마이그레이션 autogenerate가 새 모델을 보려면 필수다.
8. **템플릿 정의와 샘플 생성기를 계획의 슬라이스 순서와 다르게 내가 먼저 작성했다.** 계획은 S4(로더) → S5(샘플)의 의존을 상정했으나, `templates.json`(데이터)과 생성 스크립트를 내가 먼저 써서 S4 코드 작업과 S5 이미지 생성이 서로를 기다리지 않게 했다. 결과적으로 16분 걸리는 I/O가 코드 작업과 완전히 겹쳤다.

## 기존 실패 12건 — 무관함을 확인했다

`tests/test_dev_server.py::TestMakefileHotReload` 9건 + `tests/test_migrations.py::TestMakeMigrate` 3건이 실패한다. **추정하지 않고 확인했다**: `git stash push -u -- src/ alembic/ tests/image_generation/ assets/ scripts/`로 이번 변경을 전부 치운 상태에서 두 파일만 돌려 **같은 12건이 실패**(`12 failed, 41 passed`)함을 관측했다. 원인은 `test_dev_server.py:36`이 읽는 `Makefile`이 저장소에 없는 것(프로젝트가 `Taskfile.yml`로 옮겨감)이며 이번 작업과 무관하다. v2-D PoC의 STATUS가 기록한 "기존 12건 무관 실패"와 동일한 12건이다.

## 다음 작업에 넘길 것

- **S5 잔여 5장**: 시간이 지난 뒤 `cd api && python3 scripts/generate_template_samples.py`. 있는 것은 건너뛴다.
- **ADR `260811-234511` 제약표에 429 항목 추가** — 2/3 착수 전에 반영하는 편이 좋다.
- **2/3의 이미지 어댑터는 429를 정직하게 다뤄야 한다** — 사용자 대면 문구는 "시스템 오류"가 아니라 혼잡/한도 안내. 3/3의 UI도 그 상태를 표시해야 한다.
- 카탈로그 응답에 `prompt_suffix`가 없다는 사실은 3/3 배선의 전제다(프론트는 `template_id`만 보낸다).
