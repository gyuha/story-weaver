<!-- forge-slug: entity-image-list-patch-endpoints -->
<!-- task: 79 -->
<!-- priority: high -->
<!-- retro-hint: optional -->
<!-- tdd: on -->
# 설정 이미지 목록 조회와 대표 지정·시각 묘사 수정 엔드포인트

## 목표 / 비목표

- 목표: 1of3·2of3이 리포지토리에 만들어 두고 **HTTP로 노출하지 않은** 세 동작을 엔드포인트로 연다 — 카드의 [[설정 이미지]] 목록 조회, [[대표 이미지]] 지정, [[시각 묘사]] 수정. `#78`(3of3) 웹 배선이 이것 없이는 착수 불가다. 그리고 OpenAPI 스펙과 웹 SDK를 재생성해 #78이 바로 시작될 수 있게 만든다.
- 비목표: 개별 이미지 삭제(append-only 이력이고 재생성이 주 동작이라 지금 불필요 — 1of3의 비목표를 유지). 웹 UI 일체(#78). 리포지토리 메서드 변경(이미 완성돼 있다). 새 마이그레이션(스키마 변경 없음).

## 진실의 출처

- 글로서리 용어: `.forge/CONTEXT.md`의 **설정 이미지 · 대표 이미지 · 시각 묘사**. 새 용어는 없다.
- 관련 ADR: `260811-234512`(시각 묘사가 `entity_images`에 있고 `entities.attributes`에 없는 이유 — 이 엔드포인트가 그 컬럼을 수정한다), ADR-0005(테넌트 스코프), ADR-0006(code-first OpenAPI 계약 파이프라인 — 스펙 재익스포트의 근거).
- 왜 이 작업이 따로 있는가: `#78`의 계획서가 *"백엔드 변경 일체 비목표 — 스펙이 부족하면 3/3에서 고치지 말고 기록하고 멈춘다"*고 못박았고, 실제로 스펙이 부족했다. 1of3에서 목록 엔드포인트를 "2of3·3of3 영역"이라며 YAGNI로 미룬 판단 실수의 정산이다.
- 기존 코드(전부 읽어 확인): `entity_image_repository.py` — `list_for_entity(work_id, entity_id)`(`created_at` 오름차순) · `get(work_id, image_id)` · `set_primary(work_id, entity_id, image_id) -> EntityImage | None`(엔티티 불일치 시 None, 부분 유니크 인덱스를 위반하지 않는 순서로 기존 대표를 먼저 내린다) · `set_visual_description(image_id, text) -> None`(**없는 이미지면 조용히 반환 — 404 신호가 없다**). `image_generation_router.py:55-59` — `router`(`/image-templates`) · `images_router`(`/works/{work_id}/images`) · `generate_router`(`/works/{work_id}/entities/{entity_id}/images`) 세 라우터가 이미 있고 `main.py:290-310`에 등록돼 있다.
- Definition of Done: `curl`로 목록을 받으면 그 카드의 이미지가 append 순서로 `id·imageUrl·isPrimary·visualDescription·templateId·createdAt`과 함께 나오고, `PATCH`로 다른 장을 대표로 올리면 이전 대표가 내려가며, 같은 `PATCH`로 시각 묘사를 고칠 수 있다. 남의 `work_id`로는 전부 404. `docs/openapi.json`과 `web/src/api/`가 재생성돼 새 엔드포인트가 SDK에 들어 있고 `pnpm typecheck`가 통과한다.

## 작업 조각

- [ ] S1. 목록 엔드포인트 (TDD) — completion criterion: `GET /api/v1/works/{work_id}/entities/{entity_id}/images`가 **기존 `generate_router`에** 붙어(같은 prefix에 `POST ""`가 이미 있으므로 `GET ""`) 그 카드의 이미지를 `created_at` 오름차순으로 돌려준다. 응답 항목은 `id · imageUrl · isPrimary · visualDescription · templateId · createdAt`이며 **`imageUrl`은 `/api/v1/works/{work_id}/images/{image_id}` 문자열**로 만든다(카탈로그의 `sample_url`이 쓰는 것과 같은 방식 — `ImageTemplateResponse`가 선례). camelCase 별칭은 `ImageTemplateResponse`처럼 `alias_generator=to_camel`. 테넌트 가드는 `works_service.get_work(work_id, current_user.id)`(ADR-0005), 남의 `work_id`면 404. 이미지가 없으면 빈 배열(404 아님). pytest — 순서·필드·빈 배열·**교차 테넌트 404(가드를 제거해 red 확인)**.

- [ ] S2. 대표 지정·시각 묘사 수정 PATCH (TDD) — completion criterion: `PATCH /api/v1/works/{work_id}/images/{image_id}`가 **기존 `images_router`에** 붙는다(그 라우터에 `GET /{image_id}`가 이미 있고, `entity_id`는 이미지 행에서 읽으므로 경로에 중복시키지 않는다). 바디는 부분 갱신 `{isPrimary?: true, visualDescription?: string}` — `model_dump(exclude_unset=True)` 방식으로, `worldbible_service.py:105`·`manuscript_service.py:102,172`가 쓰는 집 스타일 그대로다(하위리소스 플래그 엔드포인트 `.../primary` 류는 이 저장소에 선례가 **0건**이라 새 관례를 들이지 않는다).
  - **`isPrimary: false`는 422로 거부한다.** 대표는 다른 장을 올리는 것으로만 바뀐다 — 내리기만 하면 "이미지가 있는데 대표가 없는 카드"가 생겨 #78의 "대표 크게" 자리가 빈다. 이미지 1장 이상인 카드는 대표가 정확히 1장이라는 불변식을 지킨다.
  - **없는 이미지·남의 `work_id`는 404.** `set_visual_description`이 없는 이미지에 조용히 반환하므로(위 진실의 출처), 서비스가 `get(work_id, image_id)`로 **먼저 확인**한 뒤 수정해야 한다 — 그 확인이 테넌트 스코프까지 겸한다.
  - 응답은 갱신된 이미지 항목(S1과 같은 형태).
  - pytest — 대표를 올리면 이전 대표가 내려감(부분 유니크 인덱스 위반 없이) · 묘사 수정이 반영됨 · 두 필드를 동시에 보내도 동작 · **`isPrimary: false`가 422**(거부를 제거해 red 확인) · 없는 이미지 404 · **교차 테넌트 404(가드 제거해 red 확인)** · 다른 카드의 `image_id`를 대표로 올리려 하면 실패(`set_primary`가 이미 None을 돌려주니 404). (depends: S1 — 응답 스키마 공유)

- [ ] S3. 계약 재생성 + 검증 — completion criterion: `cd api && uv run python scripts/export_openapi.py`로 `docs/openapi.json`을 갱신해 새 두 엔드포인트가 들어가고, `cd web && pnpm generate`로 `web/src/api/`를 재생성해 SDK에 대응 함수가 생기며 `pnpm typecheck`가 통과한다. 백엔드 게이트: `cd api && task lint`(ruff + mypy strict) 클린, `task test` 통과(커버리지 ≥70). **기존 실패 12건(`TestMakefileHotReload` 9 + `TestMakeMigrate` 3)은 `Makefile` 부재로 인한 무관 실패이므로 그 12건이 그대로인지만 확인한다** — 새로 깨진 것과 구분해 기록할 것. `curl`로 목록·PATCH 왕복을 실제로 한 번 돌려 DoD를 확인한다(이미지가 없는 카드라도 빈 배열·404 경로는 확인할 수 있고, 이미지가 있는 카드는 `entity_images`에 직접 행을 넣어 만들 수 있다). (depends: S1, S2)

## 검증 노트

**그릴링 중 확인한 것** (근거를 남긴다 — 실행 중 재확인 불필요)

- **노출 공백이 실재한다**: `grep -nE "@[a-z_]*router\.[a-z]+\(" image_generation_router.py` → 노출된 것은 `GET /image-templates`(167) · `GET /image-templates/{template_id}/sample`(182) · `GET /works/{w}/images/{image_id}`(192) · `POST /works/{w}/entities/{e}/images`(217) **네 개뿐**. `pnpm generate` 산출 SDK에도 정확히 그 4개만 있다(`getApiV1ImageTemplates` · `...ByTemplateIdSample` · `getApiV1WorksByWorkIdImagesByImageId` · `postApiV1WorksByWorkIdEntitiesByEntityIdImages`).
- **리포지토리 메서드 3개는 이미 있다**: `list_for_entity` · `set_primary` · `set_visual_description`(`grep -nE "async def"`로 확인). 이 작업은 그 위의 얇은 래퍼다 — 리포지토리를 고칠 일이 없다.
- **집 스타일은 통합 PATCH다**: `worldbible_router.py:105`이 `@router.patch("/{entity_id}")`이고, `exclude_unset=True` 부분 갱신이 `worldbible_service.py:105`·`manuscript_service.py:102,172` 세 곳에 있다. 반면 `grep -rnE '@[a-z_]*router\.(put|patch)\("[^"]*/(primary|activate|default|pin)' src/domains/` → **0건**(하위리소스 플래그 선례 없음).
- **세 라우터의 prefix**(`image_generation_router.py:55-59`): `router`=`/image-templates` · `images_router`=`/works/{work_id}/images` · `generate_router`=`/works/{work_id}/entities/{entity_id}/images`. 새 엔드포인트 둘은 **새 라우터를 만들지 않고** 기존 둘에 얹는다 — `main.py` 등록을 건드릴 일이 없다.
- **`set_visual_description`은 없는 이미지에 조용히 반환한다**(메서드 본문 확인). 그래서 404는 서비스/라우터 층에서 만들어야 한다.
- **`set_primary`는 이미 순서 문제를 풀어 뒀다**: 기존 대표를 먼저 내리고 `flush()` 후 새 대표를 세운다(독스트링에 부분 유니크 인덱스를 위반하지 않으려는 이유가 적혀 있다). 그 순서를 뒤집는 "개선"을 하지 말 것.
- **`set_primary`는 엔티티 불일치 시 `None`을 돌려준다** → 다른 카드의 `image_id`를 대표로 올리려는 요청을 404로 만들 수 있다(별도 검사 불필요).

**확인 필요** (실행 중 실측할 것)

- **`isPrimary`만 보낸 요청과 `visualDescription`만 보낸 요청이 서로를 지우지 않는가.** `exclude_unset=True`가 그것을 보장하는 기계장치지만, **방어 장치가 있다는 것과 이 경로에서 발동한다는 것은 다른 명제다**(#66이 정확히 그 가정으로 틀렸다). 한 필드만 보낸 뒤 **다른 필드가 그대로인지 DB를 조회해** 단정하라.
- **`visualDescription: ""`(빈 문자열)을 어떻게 다룰지.** #77의 프롬프트 조립은 공백만인 묘사를 "없는 것"으로 보고 카드 필드로 폴백한다(그 작업의 divergence). 빈 문자열을 그대로 저장하면 그 폴백과 정합하므로 **거부하지 말고 저장**하되, 그 정합성을 테스트로 남길지 판단하라.
- **대표를 올릴 때 부분 유니크 인덱스가 실제로 위반되지 않는가.** `set_primary`의 순서가 옳다는 것은 독스트링의 주장이다 — HTTP 경로에서 실제로 두 번 연속 대표를 바꿔 보고 제약 위반이 없는지 실측하라.

**이 저장소가 반복한 함정 (회고 + 이번 드라이브에서 관측)**

- **방어를 제거해 red를 확인할 것.** 이 계획의 red 확인 대상 넷: 교차 테넌트 404(S1·S2 각각), `isPrimary: false` 거부(S2), 없는 이미지 404(S2).
- **red가 된다 ≠ 목표 검증.** "`set_primary`가 불렸다"가 아니라 **DB에서 이전 대표의 `is_primary`가 false가 됐는지**를 단정하라(#71의 `zIndex` 함정).
- **`Settings.llm` 사고의 교훈**: 이번 드라이브에서 `openai_compatible` 자격증명이 루트 Settings를 거쳐 전달되지 않는 버그를 발견했는데, **기존 테스트가 하위 계층만 직접 검증하고 브리지를 덮지 않았기 때문**이었다. 여기서도 같은 형태를 경계하라 — 리포지토리 메서드를 직접 부르는 테스트로 만족하지 말고 **HTTP 경로를 거치는 테스트**를 남겨야 한다(그 사이의 이음매가 바로 이번에 비어 있던 곳이다).
