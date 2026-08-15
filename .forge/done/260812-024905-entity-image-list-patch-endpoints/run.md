# RUN — 설정 이미지 목록 조회와 대표 지정·시각 묘사 수정 엔드포인트

slug: entity-image-list-patch-endpoints · task 79 · priority high · tdd: on
실행: 2026-08-12 · 직접 실행(워크플로우 없음 — 슬라이스 3개가 직렬이고 파일 하나에 모이므로 병렬 이득 0)

## 슬라이스별 결과

- S1 목록 엔드포인트 — ✅ 계획대로
- S2 대표 지정·시각 묘사 수정 PATCH — ✅ 계획대로
- S3 계약 재생성 + 검증 — ⚠ 계획대로 충족, 단 `curl` 왕복의 형태가 계획과 달랐다(계정 부재 — 아래 발산 3)

## 계획대로 된 것

- **새 라우터를 만들지 않았다.** 목록은 기존 `generate_router`(`/works/{work_id}/entities/{entity_id}/images`)에 `GET ""`으로, PATCH는 기존 `images_router`(`/works/{work_id}/images`)에 `PATCH /{image_id}`로 얹었다 → `main.py` 등록을 건드릴 일이 없었다(계획의 예측대로).
- **집 스타일 그대로**: `PATCH /{id}` + `model_dump(exclude_unset=True)` 부분 갱신. 하위리소스 플래그 엔드포인트(`.../primary`)를 만들지 않았으므로 새 관례가 늘지 않았다.
- **`isPrimary: false`를 pydantic 타입으로 거부했다** — `is_primary: Literal[True] | None = None`. 런타임 검사 대신 스키마가 막으므로 코드가 한 줄도 늘지 않고 422가 자동으로 나온다(eco 사다리 ③—플랫폼 기본 기능).
- **`set_visual_description`의 404 공백을 라우터에서 메웠다** — `image_repo.get(work_id, image_id)`로 먼저 확인하고, 그 조회가 `work_id` 스코프라 테넌트 가드를 겸한다.
- **`set_primary`의 순서를 건드리지 않았다**(계획의 경고대로). 그 메서드가 이미 "기존 대표 내리고 flush → 새 대표 세움"으로 부분 유니크 인덱스를 피한다.
- 응답 `image_url`은 `ImageTemplateResponse.sample_url`과 같은 방식으로 경로 문자열을 담는다.
- 게이트: `ruff check` 클린 · `ruff format` 클린(1파일 정리 후) · `mypy src` **171파일 no issues** · `pytest -q` **1065 passed, 1 skipped**(#77 시점 1053에서 +12 = 신규 테스트 정확히 그만큼) · `pnpm generate` 후 `pnpm typecheck`·`pnpm lint` 클린.
- **OpenAPI·SDK 재생성 확인**: `docs/openapi.json`의 `/api/v1/works/{work_id}/entities/{entity_id}/images`가 `['get','post']`, `/api/v1/works/{work_id}/images/{image_id}`가 `['get','patch']`. 웹 SDK에 `getApiV1WorksByWorkIdEntitiesByEntityIdImages`·`patchApiV1WorksByWorkIdImagesByImageId` 두 함수가 생겼다(총 6개).

## 방어를 깨뜨려 red를 확인한 것 — 계획이 지정한 넷 전부

각각 방어를 임시 제거해 실행하고, 지목한 테스트가 정확히 red가 되는 것을 관측한 뒤 원복했다.

1. **목록의 테넌트 가드** 제거 → `test_list_entity_images_other_tenant_returns_404` red.
2. **PATCH의 테넌트 가드** 제거 → `test_patch_other_tenant_returns_404` red.
3. **`isPrimary: false` 거부**를 `Literal[True]` → `bool`로 완화 → `test_patch_is_primary_false_is_rejected` red.
4. **없는 이미지 404 검사** 제거 → `test_patch_unknown_image_returns_404` red.

복원 후 12 passed로 복귀. 그리고 **테스트가 보는 명제를 목표에 맞췄다** — 대표 지정은 "`set_primary`가 불렸다"가 아니라 `_reload()`로 **DB를 다시 읽어 이전 대표의 `is_primary`가 false가 됐는지**를 단정한다(계획이 `#71`의 `zIndex` 함정으로 경계한 지점).

## 계획의 "확인 필요" 세 건을 실측으로 닫았다

1. **한 필드만 보낸 요청이 다른 필드를 지우지 않는가** → `test_patch_one_field_does_not_clear_the_other`. 대표만 바꾼 뒤 묘사가 살아 있는지, 묘사만 바꾼 뒤 대표 상태가 유지되는지를 **각각 DB를 다시 읽어** 단정했다. `exclude_unset=True`가 이 경로에서 실제로 발동한다는 것을 확인했다(`#66`의 "방어가 있다 ≠ 이 경로에서 발동한다"를 피했다).
2. **`visualDescription: ""`을 어떻게 다룰지** → 거부하지 않고 그대로 저장한다(`test_patch_empty_visual_description_is_stored`). #77의 프롬프트 조립이 공백만인 묘사를 "없는 것"으로 보고 카드 필드로 폴백하므로 정합하며, 그 정합성을 테스트로 남겼다.
3. **연속으로 대표를 바꿔도 부분 유니크 인덱스를 위반하지 않는가** → `test_patch_promoting_twice_does_not_violate_partial_unique_index`. HTTP 경로로 두 번 연속 대표를 바꾸고 두 행의 최종 상태를 DB에서 확인했다. `set_primary` 독스트링의 주장을 실측으로 뒷받침했다.

## 발산

1. **`is_primary` 거부를 런타임 검사가 아니라 pydantic `Literal[True]`로 구현했다.** 계획은 "422로 거부"만 지정했고 방법은 열려 있었다. 타입으로 막는 편이 코드가 없고 OpenAPI 스펙에도 제약이 드러난다.
2. **`EntityImageResponse`·`UpdateEntityImageRequest`를 스키마 파일이 아니라 라우터 파일에 두었다.** `GenerateEntityImageRequest`가 이미 라우터에 있어(2of3이 그렇게 뒀다) 같은 자리에 붙이는 것이 일관됐다. `image_generation_schemas.py`는 카탈로그 전용으로 남는다 — 나중에 스키마가 늘면 옮길 후보다.
3. **`curl` 왕복을 계획과 다른 형태로 했다.** 계획은 "`curl`로 목록·PATCH 왕복"을 요구했으나 **dev DB에 비밀번호를 아는 계정이 없다**(#75에서 확인한 것과 같은 벽 — 새로 가입하면 QA 잔여 데이터가 늘어난다). 그래서 실 앱(`main:app`, 포트 8012)을 띄워 **인증 없이 호출해 401을 받는 것으로 라우터 등록과 인증 배선을 확인**했다: 신규 목록·PATCH가 **401**(미등록이면 404), 공개 카탈로그가 **200**, 없는 경로가 **404**(대조군 — 401과 404가 실제로 구분된다는 증거). 나머지 계약(실 DB·테넌트 가드·부분 갱신·DB 상태)은 `ASGITransport` e2e 테스트 12건이 **실 DB로** 덮는다. 그리고 `scripts/export_openapi.py`가 `from main import app`으로 스펙을 뽑으므로 두 경로가 스펙에 나타난 것 자체가 `main.py` 등록의 증거다.
   남은 사각지대는 **실 JWT 인증 한 겹뿐**이고, 그것은 이 두 라우터의 다른 엔드포인트와 동일한 `get_current_user` 의존성이라 기존 인증 테스트가 이미 덮는다.
4. **테스트가 자체 `FastAPI()`를 만든다**(기존 `test_image_generation_router.py`의 패턴을 그대로 따랐다). 그래서 테스트만으로는 `main.py` 등록을 검증하지 못한다 — 위 3번의 401 확인과 OpenAPI 익스포트가 그 공백을 메운다. **이 저장소의 테스트 관례가 가진 구조적 사각지대이므로 기록해 둔다.**

## 기존 실패 12건 — 불변

`TestMakefileHotReload` 9 + `TestMakeMigrate` 3. `Makefile` 부재(프로젝트가 Taskfile로 이전)로 인한 무관 실패이며, #76 실행에서 `git stash`로 이번 변경들을 치운 상태에서도 동일하게 실패함을 관측해 이미 입증했다. 새로 깨진 것은 없다.

## 이 작업이 푼 것

`#78`(3of3 웹 배선)의 유일한 차단 요인이 사라졌다 — 썸네일 스트립(목록)·대표 지정·묘사 편집에 필요한 계약이 SDK까지 준비됐다. `#78`은 이제 쿼터와 무관하게 착수할 수 있다(다만 그 작업의 브라우저 UAT는 이미지 생성 쿼터를 필요로 한다).
