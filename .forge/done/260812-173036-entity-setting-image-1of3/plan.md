<!-- forge-slug: entity-setting-image-1of3 -->
<!-- task: 76 -->
<!-- part: 1/3 -->
<!-- tdd: on -->
# 설정 이미지 (1/3): 저장 기반 · entity_images 테이블 · 이미지 템플릿 카탈로그 16개

## 목표 / 비목표

- 목표: [[설정 이미지]]가 살 자리를 만든다 — 이미지 파일을 `work_id` 스코프 경로에 쓰고 읽는 저장 모듈, `entity_images` 테이블(+[[대표 이미지]] 지정, [[시각 묘사]] 컬럼)과 마이그레이션, [[이미지 템플릿]] 16개의 카탈로그(JSON 단일 출처 + 샘플 썸네일 16장)와 조회 엔드포인트. **생성 호출은 여기서 하지 않는다** — 2/3의 몫이다.
- 비목표: 이미지 생성 실호출·비전 역번역·SSE 라우트(2/3). 웹 배선 일체(3/3). 객체 스토리지(MinIO/S3) 도입 — ADR `260811-234511`이 유보했다. 개별 이미지 삭제 기능. 소설 본문에 이미지 적용(다음 ask).

## 진실의 출처

- 글로서리 용어: `.forge/CONTEXT.md`의 **설정 이미지 · 이미지 템플릿 · 대표 이미지 · 시각 묘사**. "에셋"은 쓰지 않는다 — 대상은 언제나 [[엔티티 카드]] 4종(인물·장소·사건·아이템)이다.
- 관련 ADR: `.forge/adr/260811-234511-image-generation-via-local-gateway-filesystem-storage.md`(파일시스템 저장을 고른 이유·게이트웨이 실측 제약), `.forge/adr/260811-234512-character-consistency-via-vision-round-trip-description.md`(시각 묘사를 `attributes` **밖**에 두는 이유 — 이 플랜의 스키마 결정이 곧 그 결정이다), ADR-0005(테넌트 스코프), ADR-0001.
- 참고 문서: `docs/architecture.md` 2.5(객체 스토리지 자리 — 이번엔 채우지 않는다), `docs/image-generation.md` 3장(카드→프롬프트 매핑표). **`image-generation.md` 2.3의 "전략 (c) 권고"와 4장의 모더레이션은 이 인프라에 적용 대상이 없다**(ADR `260811-234511`).
- 기존 코드: `api/src/domains/image_generation/service/image_generation_service.py`(v2-D S1 잔존물 — 인물·장소 매핑 함수 2개, 32줄). `api/src/domains/worldbible/models/worldbible_models.py`(`Entity` — 이미지 필드 없음).
- Definition of Done: `GET /api/v1/image-templates`가 유형별로 필터된 16개 템플릿(샘플 썸네일 URL 포함)을 돌려주고, 샘플 썸네일이 브라우저에서 실제로 렌더되며, `entity_images` 테이블이 마이그레이션으로 생성돼 있고, 저장 모듈이 파일 쓰기·읽기·삭제를 왕복한다. 전부 `curl` + `pytest`로 확인 가능.

## 작업 조각

- [ ] S1. 이미지 저장 모듈 (TDD) — completion criterion: `work_id`/`entity_id` 스코프 경로에 바이트를 쓰고, 읽고, 지우는 함수가 모듈 **하나**에 모여 있다(ADR `260811-234511`이 "객체 스토리지로 옮길 때 이 모듈 교체로 끝나게" 하라고 한 그 경계). 경로 조립이 `work_id`를 벗어나는 입력(`../`, 절대경로)을 거부한다 — 그 거부를 재현하는 테스트를 포함한다. 저장 루트는 설정값이며 `.gitignore` 대상이다. pytest.

- [ ] S2. `entity_images` 테이블 + 마이그레이션 (TDD) — completion criterion: `id · work_id · entity_id(FK, ondelete CASCADE) · file_path · template_id · extra_prompt · final_prompt · visual_description(nullable) · created_at` 컬럼과, [[대표 이미지]]를 가리키는 수단이 있다. **`visual_description`은 `entities.attributes` 밖에 있다** — ADR `260811-234512`의 핵심이며, 이걸 `attributes`에 넣으면 `worldbible_service.py:39`의 `_entity_content()`가 통째로 임베딩해 [[메모리]]를 오염시킨다. `alembic upgrade head` → `downgrade` 왕복이 깨끗하고, 대표 이미지 제약(카드당 최대 1장)을 위반하는 삽입이 실패하는 테스트가 있다. pytest.

- [ ] S3. 카드 삭제 시 파일 정리 (TDD) — completion criterion: 엔티티 카드를 삭제하면 그 카드의 이미지 **파일까지** 사라진다. FK CASCADE는 DB 행만 지우므로 서비스가 명시적으로 파일을 지워야 한다(ADR `260811-234511` Consequences). 카드를 지운 뒤 파일이 남아 있지 않음을 단정하는 테스트. pytest. (depends: S1, S2)

- [ ] S4. 이미지 템플릿 카탈로그 16개 + 샘플 썸네일 — completion criterion: 화풍 4종(수묵화·웹툰·유화·사진풍) × 카드 유형 4종(인물=반신 / 장소=원경 / 사건=장면 / 아이템=단독·흰 배경) = **16개** 템플릿이 백엔드 JSON **단일 출처**에 있고(`api/assets/image-templates/`), 각 항목이 `id · label · entity_type · prompt_suffix(화풍+구도+배경+품질) · sample` 을 갖는다. 프론트는 라벨 사본을 갖지 않는다 — 프롬프트 조립이 백엔드이므로(`image-generation.md` 3.3, ADR-0001) 템플릿 본문도 백엔드에 있어야 한다. 로드 시 1회 검증(형식이 깨지면 부팅 실패로 드러난다). pytest.

- [ ] S5. 샘플 썸네일 16장 생성·축소·커밋 — completion criterion: 16개 템플릿 각각의 샘플 이미지가 **320px로 축소돼** `api/assets/image-templates/`에 커밋돼 있다. `api/.pre-commit-config.yaml:42`의 `check-added-large-files --maxkb=1000`을 **개별 파일 전부** 통과한다(원본은 683~871KB로 한도에 아슬아슬하다 — 축소가 선택이 아니다). 축소는 `sips`로 한 번 돌려 커밋하며 **런타임 리사이즈 코드는 0줄**이다. 생성이 장당 18~60초라 16장에 최대 16분이 걸리는 것은 예상된 비용이다. (depends: S4)

- [ ] S6. 카탈로그 · 이미지 조회 엔드포인트 (TDD) — completion criterion: `GET /api/v1/image-templates?entity_type=...`이 해당 유형의 템플릿만 돌려주고 샘플 URL이 실제로 200으로 렌더된다(샘플은 테넌트 데이터가 아니라 정적 자산이므로 인증 게이트 불필요). 이미지 조회는 반대로 **테넌트 가드를 통과해야** 바이트를 넘긴다 — 남의 `work_id` 이미지를 요청하면 404다(ADR-0005). 교차 테넌트 404를 재현하는 테스트를 포함한다. pytest. (depends: S1, S4)

- [ ] S7. 검증 — completion criterion: `cd api && task lint`(ruff + mypy strict) 클린, `task test` 통과(커버리지 ≥70 유지), `alembic upgrade head` 성공. `curl`로 카탈로그 조회 → 샘플 썸네일 렌더를 눈으로 확인. (depends: S1–S6)

## 검증 노트 (이 플랜의 사실 주장은 어떻게 확인됐나)

**그릴링 중 실행해 확인한 것** — 아래는 추론이 아니라 관측이다:

- `image_generation_service.py`가 32줄·함수 2개뿐이고 라우터·실호출이 없다 → 파일 전문 읽음.
- `entities` 테이블에 이미지 필드가 없다 → `worldbible_models.py` 전문 읽음(컬럼 9개, 이미지 관련 0).
- `_entity_content()`가 `attributes` **전체**를 `json.dumps`해 임베딩한다 → `worldbible_service.py:39-46` 읽음. `index_source`가 `chunk_index=0` 하나만 쓴다 → `memory_service.py:1-4` 독스트링. **S2의 스키마 결정이 이 두 사실에 걸려 있다.**
- 객체 스토리지가 없다 → `docker-compose.yml`에 서비스 3개(postgres/redis/mailpit), `grep -rniE 'minio|boto3|aiobotocore|StaticFiles|UploadFile'` 결과 0건.
- `check-added-large-files --maxkb=1000` → `api/.pre-commit-config.yaml:42` 읽음. 생성 원본이 683KB·871KB → 실제 생성물 `wc -c`.
- 게이트웨이 실측(생성 200 / edits 400 / seed 무효 / n=2 400 / size 비율만) → ADR `260811-234511`의 표. **재현 명령이 그 ADR에 남아 있지 않으므로, 2/3 착수 시 어댑터를 붙이기 전에 한 번 더 실호출로 확인할 것** — 게이트웨이는 LAN 호스트(`192.168.0.11:20128`)이고 그릴링 중 한 번 TCP 연결 불가 상태였다.

**아직 확인하지 않은 것 (실행 중 확인할 것)**:

- 저장 루트 설정값이 `core/config.py`의 어느 Settings 클래스에 들어가야 자연스러운지 — 코드를 보고 결정한다.
- `sips`가 이 머신에서 JPEG 320px 축소를 문제없이 하는지 — S5에서 첫 장으로 확인한 뒤 나머지를 돌린다.
- 대표 이미지 제약을 DB 레벨(부분 유니크 인덱스)로 걸 수 있는지 vs 서비스 레벨로 둘지 — S2에서 실제로 걸어 보고 결정하되, **어느 쪽이든 위반 삽입이 실패하는 테스트를 남긴다.**

**이 저장소가 반복한 함정 (회고에서 가져옴)**:

- **방어 테스트를 넣었으면 그 방어를 제거해 red가 되는지 확인할 것.** `summary-draft` 회고가 7개를 이 방식으로 검증하고 1개를 "도달 불가"로 걸러냈다. 이 플랜에서 red 확인 대상은 셋이다 — 경로 탈출 거부(S1), 대표 이미지 중복 삽입 실패(S2), 교차 테넌트 404(S6).
- **red가 된다 ≠ 옳은 것을 본다.** 같은 회고의 `zIndex: 60` 사례. 특히 S3(파일 정리)는 "삭제 함수가 불렸다"가 아니라 **"파일이 실제로 없다"**를 단정해야 한다 — 목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다(그 회고가 꼽은 네 번째 유형).
- **커버리지 ≥70과 기존 테스트 불변을 S7에서 확인할 것.** v2-D PoC 때 "기존 12건 무관 실패"가 있었으므로, 새로 깨진 것과 원래 깨져 있던 것을 구분해 기록한다.
