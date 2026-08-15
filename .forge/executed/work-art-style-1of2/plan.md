<!-- forge-slug: work-art-style-1of2 -->
<!-- task: 80 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 작품 화풍 (1/2): 저장·카탈로그 축 분리·프롬프트 조립·엔드포인트

## 목표 / 비목표

- 목표: [[작품 화풍]]을 백엔드에 만든다 — `works`에 화풍·톤을 저장하고, 16개 템플릿의 `prompt_suffix`를 **화풍 4조각 + 유형별 구도 4조각으로 분리**하고, 화풍 카탈로그·작품 화풍 조회·저장 엔드포인트를 열고, 프롬프트 조립을 (작품 화풍 + 유형 구도 + 작품 톤)으로 바꾸고, **화풍 미지정 작품의 생성을 거부**한다. `curl`만으로 끝까지 검증한다.
- 비목표: 웹 일체(2/2). 새 작품 만들기 위저드에 화풍 단계 추가 — 만든 직후는 정보가 가장 부족한 시점이라 첫 이미지를 만들려 할 때 정하게 한다(ADR `260813-110724`). 구도 축 확장(인물 전신/반신/얼굴 등) — 요청 범위 밖이고 견본을 그만큼 더 만들어야 한다. 기존 작품에 화풍 기본값 채우기 — 마이그레이션은 `null`로 남긴다. 이미 생성된 이미지의 소급 변경(과거는 `final_prompt`로 보존된다).

## 진실의 출처

- 글로서리 용어: `.forge/CONTEXT.md`의 **작품 화풍**(신규) · **이미지 템플릿**(정의가 이 작업으로 바뀌었다 — 화풍이 빠졌다) · **설정 이미지** · **대표 이미지** · **시각 묘사**. UI 레이블은 `이미지 스타일`이지만 코드·문서 용어는 **작품 화풍**이다.
- 관련 ADR: `.forge/adr/260813-110724-work-owns-art-style-templates-own-composition.md` — 축 분리의 근거, 대안 3개, "잠그지 않는다"의 논거, 그리고 이 작업이 만드는 결과들(계약 변경·그리드 이주·미지정 거부)이 전부 여기 있다. **먼저 읽을 것.** 함께: `260811-234511`(게이트웨이 제약·파일시스템 저장), `260811-234512`(시각 묘사 우선 조립), ADR-0005(테넌트 스코프), ADR-0004(사용자는 저수준을 다루지 않는다 — 자유 프롬프트를 택하지 않은 근거).
- 기존 코드(전부 읽어 확인): `api/assets/image-templates/templates.json` — 16개, `prompt_suffix`에 **화풍과 구도가 한 문장에 섞여 있다**(예: `"수묵화풍 삽화, 먹선과 옅은 채색, 상반신 반신 구도, 차분한 표정, 흰 한지 배경, 인물 한 명만, 고화질 설정화"`). `samples/` 16장(총 556KB, 최대 52KB, 전부 실 JPEG). `service/template_catalog.py`(`list_templates`·`get_template`·`sample_path`). `service/image_generation_service.py`의 `build_entity_image_prompt`(시각 묘사 우선 → 카드 필드 → extra → `prompt_suffix`). `router/image_generation_router.py`의 `generate_router`(`POST ""`가 `GenerateEntityImageRequest{template_id, extra_prompt}`를 받는다) · `_stream_entity_image_generation`. `works/models/works_models.py`(`Work` — 설정 blob 없음, 컬럼 추가가 필요하다).
- Definition of Done: `curl`로 ① 화풍 카탈로그가 4개를 돌려주고 각 화풍이 **유형별 견본 URL**을 갖는다(C안 화면이 화풍마다 견본 3장을 보여준다) ② 작품 화풍을 저장하고 다시 읽으면 그대로다 ③ 화풍을 정한 작품에서 SSE 생성이 성공하고 `final_prompt`에 **작품 화풍 조각 + 유형 구도 조각 + 작품 톤**이 모두 들어 있다 ④ 화풍이 `null`인 작품에서 생성 요청이 명확한 오류로 거부된다 ⑤ 남의 `work_id`는 전부 404. `docs/openapi.json`이 갱신된다.

## 작업 조각

- [ ] S1. `works`에 화풍·톤 컬럼 + 마이그레이션 (TDD) — completion criterion: `art_style_id`(String, nullable) · `art_style_note`(Text, nullable 또는 default `''`)를 `works`에 추가한다. `api/alembic/versions/0006_*.py`, `down_revision = "0005_entity_images"`. **기존 작품에 기본값을 채우지 않는다**(ADR의 "조용히 정하면 개념이 무의미해진다") — `upgrade`/`downgrade` 왕복이 깨끗하고, 기존 4건이 `null`로 남는 것을 단정하는 테스트. `0005_entity_images.py`의 한국어 독스트링 스타일을 따른다. pytest.

- [ ] S2. 카탈로그 축 분리 (TDD) — completion criterion: 16개 `prompt_suffix`를 **화풍 4조각**(`ink`·`webtoon`·`oil`·`photo` — 화풍과 매체만: 예 `"수묵화풍 삽화, 먹선과 옅은 채색"`)과 **유형별 구도 4조각**(`character`·`location`·`event`·`item` — 구도·배경·품질만: 예 `"상반신 반신 구도, 차분한 표정, 흰 배경, 인물 한 명만, 고화질 설정화"`)으로 나눈다. 자산 구조는 **가장 게으른 형태**를 고르되(예: `templates.json`을 `styles`·`compositions` 두 배열로 바꾸기), **기존 16장 샘플의 파일명 규약(`<style>-<type>.jpg`)을 깨지 않는다** — 그 16장이 화풍 선택 화면의 견본이고 파일을 다시 만들 쿼터 여유가 없다. 로드 시 1회 검증(형식이 깨지면 부팅 실패). 단정할 것: 화풍 4·구도 4가 로드됨 · 임의의 (화풍, 유형) 조합으로 조립한 문장이 **화풍 어휘와 구도 어휘를 모두 포함**하고 중복 어구가 없음 · 깨진 JSON이 예외를 던짐(그 방어를 제거해 red 확인). pytest.

- [ ] S3. 프롬프트 조립 변경 (TDD) — completion criterion: `build_entity_image_prompt`가 `template_id` 대신 **(작품 화풍 id, 작품 톤, 카드 유형, 카드 attributes, 시각 묘사, 추가 지시)** 로 조립한다. 순서는 `주 묘사(시각 묘사 우선, 없으면 카드 필드) → 추가 지시 → 작품 톤 → 화풍 조각 → 구도 조각`. **시각 묘사 우선 규칙은 그대로 유지**한다(ADR `260811-234512` — 재생성 일관성의 전부다). 작품 톤이 공백만이면 넣지 않는다(task 77 S1이 시각 묘사에 쓴 것과 같은 엄격 해석). pytest — 유형 4종 × (시각 묘사 있음/없음) × (톤 있음/없음) 조합 · 인물에서 성격·말투·관계가 없음 · 빈 조각이 구분자만 남기지 않음 · **시각 묘사가 카드 필드를 대체(이어붙이지 않음)**. (depends: S2)

- [ ] S4. 화풍 카탈로그 · 작품 화풍 조회·저장 엔드포인트 (TDD) — completion criterion:
  - `GET /api/v1/art-styles` — 화풍 4개. 각 항목이 `id`·`label`과 **유형별 견본 URL 묶음**(인물·장소·아이템 최소 3개 — C안 화면이 화풍마다 3장을 보여준다)을 갖는다. 정적 자산이므로 **인증 불필요**(기존 `/image-templates` 선례와 동일).
  - `GET /api/v1/works/{work_id}/art-style` · `PUT .../art-style`(바디 `{artStyleId, artStyleNote?}`) — 인증 + 테넌트 가드(`works_service.get_work`), 남의 `work_id`면 404. 없는 화풍 id는 422. `artStyleNote`는 빈 문자열 허용(톤 없음).
  - 기존 `/image-templates` 엔드포인트는 **어떻게 할지 이 슬라이스에서 결정하고 근거를 `run.md`에 적는다** — 화풍이 빠진 뒤에도 구도 카탈로그로 쓸 값이 있는지, 아니면 웹이 더 안 쓰므로 지울지. 2/2가 무엇을 부르는지가 여기 달렸다.
  - pytest — 카탈로그 4개·견본 URL 실제 200 · 저장→조회 왕복 · **교차 테넌트 404(가드를 제거해 red 확인)** · 없는 화풍 id 422. (depends: S1, S2)

- [ ] S5. SSE 생성 라우트 계약 변경 + 미지정 거부 (TDD) — completion criterion: `POST /api/v1/works/{work_id}/entities/{entity_id}/images`가 **`templateId`를 받지 않는다** — 작품의 화풍을 읽어 조립한다(요청 바디는 `extraPrompt?`만). **화풍이 `null`이면 생성하지 않고 명확한 오류로 거부**한다(상태 코드와 메시지는 이 슬라이스에서 정하고 근거를 남긴다 — 웹이 "먼저 화풍을 정해 주세요" 유도를 그 신호로 띄운다). 나머지 계약(단계 이벤트 순서·이미지 먼저 커밋 후 묘사·첫 이미지 자동 대표·테넌트 가드)은 **그대로 유지**한다. pytest — 화풍이 있으면 성공하고 `final_prompt`에 화풍·구도·톤 어휘가 모두 들어감 · **화풍 null이면 거부**(그 거부를 제거해 red 확인) · `templateId`를 보내도 무시되거나 거부됨(어느 쪽인지 정하고 테스트로 고정) · 교차 테넌트 404. (depends: S3, S4)

- [ ] S6. 계약 재생성 + 검증 — completion criterion: `cd api && uv run python scripts/export_openapi.py`로 `docs/openapi.json`을 갱신해 새 엔드포인트 3개(`art-styles`·`art-style` GET/PUT)가 들어가고 SSE 라우트의 바디 스키마가 바뀐다. `task lint`(ruff + mypy strict) 클린, `task test` 통과(커버리지 ≥70). **기존 실패 12건(`TestMakefileHotReload` 9 + `TestMakeMigrate` 3)은 `Makefile` 부재로 인한 무관 실패이므로 그 12건이 그대로인지만 확인**하고 새로 깨진 것과 구분해 기록한다. `alembic upgrade head` 성공. **`curl`로 DoD 5항목을 실제로 왕복**한다 — 인증이 필요한 항목은 앱 자신의 `create_access_token`으로 JWT를 발급해 쓴다(task 77·79에서 검증된 방법: 새 계정을 만들지 않고 데이터도 남기지 않는다). (depends: S1–S5)

## 검증 노트

**그릴링 중 확인한 것** (근거를 남긴다 — 실행 중 재확인 불필요)

- **`prompt_suffix`에 화풍과 구도가 섞여 있다**: `templates.json`을 읽어 확인했고, 실제 저장된 `final_prompt`도 그렇다 — `"a. 이십 대 여성 검객, 칠흑색 장발. 수묵화풍 삽화, 먹선과 옅은 채색, 상반신 반신 구도, 차분한 표정, 흰 한지 배경, 인물 한 명만, 고화질 설정화"`(DB 조회). **S2가 쪼갤 대상이 정확히 이 문장 구조다.**
- **각 이미지가 자기 생성 근거를 보관한다**: `entity_images`에 `template_id`·`extra_prompt`·`final_prompt`(전문). 실제 값 확인. **그래서 화풍을 바꿔도 과거가 손상되지 않고, 이것이 "잠그지 않는다"의 근거다**(ADR).
- **`works`에 설정 blob이 없다**: 컬럼 9개(`id·user_id·title·short_label·genre·sub_genre·keywords·style·status·cover_theme·created_at·updated_at`)를 읽어 확인. 컬럼 추가가 필요하다. **주의: 이미 `style` 컬럼이 있다**(문체 — `간결체` 등). 화풍 컬럼 이름을 `style`과 헷갈리지 않게 지을 것(`art_style_id` 권장).
- **작품 단위 설정의 선례가 없다**: [[품질 티어]]는 글로서리가 "작품 전체에 적용"이라 적었지만 구현은 사용자 전역 설정이다(`web/src/features/settings/store/settings.store.ts`의 `qualityTier`, `llm-screen.tsx`). 즉 이것이 **작품이 실제로 소유하는 첫 설정**이다.
- **샘플 16장은 전부 있다**: 개수 16 · 총 556KB · 최대 파일 52,120 bytes(`check-added-large-files --maxkb=1000` 통과) · `file -b`로 전부 실 JPEG 확인. **파일명 규약 `<style>-<type>.jpg`가 화풍×유형 조합과 정확히 일치**하므로 S2가 이 규약을 깨면 견본 URL 조립이 무너진다.
- **게이트웨이 이미지 쿼터는 유한하다**: 연속 11장 뒤 429가 나고 리셋까지 3시간이 걸렸다(실측, ADR `260811-234511`). **샘플을 다시 만들 여유가 없으니 기존 16장을 그대로 쓰는 설계를 유지할 것.**

**확인 필요** (실행 중 실측할 것 — 지금은 근거 없음)

- **화풍 조각과 구도 조각을 이어붙인 문장이 실제로 좋은 이미지를 내는가.** 지금 16개 `prompt_suffix`는 사람이 한 문장으로 다듬은 것이고, 기계적으로 쪼개 다시 이으면 어색해질 수 있다("수묵화풍 삽화, 먹선과 옅은 채색" + "상반신 반신 구도, …" → 쉼표가 겹치거나 어순이 어색). **쪼갠 뒤 실제로 1~2장 생성해 눈으로 확인**하라(쿼터를 아껴 최소 횟수로). 어색하면 조각의 문구를 다듬어야 한다 — 이것이 이 작업의 유일한 품질 리스크다.
- **`/image-templates` 엔드포인트의 운명**(S4에 명시). 지우면 2/2가 부를 것이 없고, 남기면 화풍이 빠진 반쪽 카탈로그가 된다. 실제 코드를 보고 정하라.
- **`templateId`를 보내는 옛 요청을 어떻게 다룰지**(S5). 무시할지 422로 거부할지 — 거부가 정직하지만 2/2가 들어오기 전까지 웹이 계속 그것을 보내므로 로그가 시끄러워진다. 정하고 테스트로 고정하라.
- **`art_style_note`의 기본값**을 `''`로 둘지 `null`로 둘지. 프롬프트 조립이 공백만인 톤을 "없음"으로 보므로 어느 쪽이든 동작하나, 한쪽을 골라 스키마와 조립을 맞춰라.

**이 저장소가 반복한 함정**

- **방어를 제거해 red를 확인할 것.** 이 계획의 red 확인 대상 넷: 깨진 카탈로그 JSON 예외(S2) · 교차 테넌트 404(S4) · 화풍 null 생성 거부(S5) · 시각 묘사 우선 규칙(S3 — 제거하면 카드 필드로 떨어지는지).
- **red가 된다 ≠ 목표 검증.** S3의 조립 테스트는 "함수가 불렸다"가 아니라 **결과 문자열이 화풍 어휘와 구도 어휘를 모두 포함하는지**를 단정해야 한다.
- **`Settings.llm` 사고의 교훈**(task 77에서 발견): 하위 계층만 직접 검증하고 그 위 이음매를 덮지 않으면 브리지가 조용히 죽는다. S4·S5는 **HTTP 경로를 거치는 테스트**를 남겨라 — 카탈로그 로더를 직접 부르는 테스트로 만족하지 말 것.
- **task 79의 교훈**: 테스트가 자체 `FastAPI()`를 만들므로 테스트만으로는 `main.py` 등록을 검증하지 못한다. S6의 `curl` 왕복(또는 OpenAPI 익스포트가 `from main import app`을 쓰는 사실)이 그 공백을 메운다.
