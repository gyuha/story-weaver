<!-- forge-slug: chapter-version-history-1of2 -->
<!-- task: 72 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 화 버전 기록 (1/2): 저장마다 스냅샷을 쌓는 백엔드

## Goal / Non-goals
- Goal: `chapter_versions` 테이블을 만들고, **본문이 실린 모든 화 PATCH가 그 본문을 새 버전으로 append**하도록 `ManuscriptService.update_chapter` 한 곳에 건다(직전 버전과 본문이 같으면 만들지 않음 = dedup). 요약만 실린 PATCH는 새 버전을 만들지 않고 **최신 버전의 요약만 갱신**한다. 마이그레이션이 기존 화의 현재 본문을 초기 버전으로 백필한다. 목록·단건 조회 엔드포인트를 열고 `docs/openapi.json`을 갱신한다.
- Non-goals: web 배선 전부(2of2). **복원 전용 엔드포인트**(되돌리기는 기존 `PATCH .../chapters/{id}` 재사용 — ADR 260805-214733). 보존 상한·정리·아카이빙. 요약 자체의 버전 이력. 시놉시스·부·작품 단위 버전. 버전 삭제·이름 붙이기·태그. 두 과거 버전 간 비교. 되돌리기에 "복원됨" 라벨 붙이기.

## Source of truth
- Glossary terms: [[버전 기록]], [[화]], [[화 요약]], [[메모리]], [[늘려쓰기]] in `.forge/CONTEXT.md`
- Related ADRs: `.forge/adr/260805-214733-version-as-append-on-save-snapshot.md` (이번 그릴링에서 작성 — 스냅샷 시점·생성 주체·되돌리기 의미·백필), `.forge/adr/0005-users-as-tenant-app-layer-scoping.md` (소유권은 앱 계층에서 — 기존 `get_chapter(work_id, user_id, ...)`를 그대로 거쳐 검증한다)
- Definition of Done: `PATCH .../chapters/{id} {body}`를 두 번 다른 본문으로 부르면 `GET .../chapters/{id}/versions`가 최신순 2개를 주고 최신 항목의 본문이 `chapters.body`와 같다. 같은 본문으로 다시 PATCH하면 항목이 늘지 않는다. `PATCH {summary}`만 부르면 항목 수가 그대로이고 최신 항목의 요약이 갱신된다. 마이그레이션 후 본문이 있는 기존 화마다 버전이 1개 있다. 화를 삭제하면 그 버전들이 함께 사라진다. 다른 사용자의 화 버전 조회는 404. `uv run pytest`(커버리지 ≥70) · `mypy --strict` · `ruff` 통과, `docs/openapi.json`에 새 경로 2개 반영.

## Work slices
- [ ] S1. 모델 + 마이그레이션 — `ChapterVersion`(`id`, `chapter_id` FK `ondelete=CASCADE`, `body` Text, `summary` Text nullable, `created_at` timestamptz server_default now)과 `(chapter_id, created_at DESC)` 인덱스. Alembic `0004`는 테이블 생성 + `INSERT ... SELECT`로 `body <> ''`인 화의 `body`·`summary`를 버전 1개씩 백필(`created_at` = 마이그레이션 시각). `downgrade`는 테이블 drop — 완료 기준: 로컬 DB에 `alembic upgrade head` 후 본문 있는 화 수와 버전 행 수가 같고, 화 1건 삭제 시 그 버전이 0으로 줄어드는 것을 pytest로 확인.
- [ ] S2. 버전 생성 훅 — `update_chapter`에서 `"body" in changes`일 때(기존 재임베딩 판정과 **같은 키 존재 판정**을 쓴다 — 빈 문자열을 falsy로 걸러내면 본문을 비운 저장이 이력에서 빠진다) 최신 버전을 읽어 본문이 다르면 새 버전 append, `summary`는 그 시점 `chapter.summary`를 함께 담는다. `"body"`가 없고 `"summary" in changes`면 최신 버전의 `summary`만 갱신(최신 버전이 없으면 아무것도 안 함) — 완료 기준: 네 가지 pytest가 각각 red → green — ① 다른 본문 2회 PATCH → 버전 2개 ② 같은 본문 재PATCH → 1개 유지 ③ `{summary}`만 PATCH → 개수 불변·최신 요약 갱신 ④ `body=""` PATCH → 버전 생성됨. (depends: S1)
- [ ] S3. 조회 API — `GET .../chapters/{chapter_id}/versions?limit=30&offset=0`(최신순, 응답 항목은 `id`·`created_at`·`char_count`·`char_delta`·`has_summary`, 전체 개수 `total` 포함)과 `GET .../chapters/{chapter_id}/versions/{version_id}`(`body`·`summary` 포함). `char_count`는 `char_length(body)`. `char_delta`는 **직전(더 오래된) 버전과의 차이**로, 페이지 경계에서 어긋나지 않게 `limit+1`개를 조회해 마지막 항목의 delta만 계산에 쓰고 응답에서는 제외한다(가장 오래된 버전의 delta는 `null`). 소유권은 기존 `get_chapter`를 거쳐 검증 — 완료 기준: pytest로 5개 버전 시드 후 `limit=2&offset=0`과 `offset=2`의 `char_delta`가 전량 조회 시의 값과 일치하고, 남의 화에 대한 두 엔드포인트가 404. 저장소 최초의 페이지네이션이므로 `limit` 상한(예: 100)과 음수 거부를 함께 못박는다. (depends: S2)
- [ ] S4. 스펙 갱신 — `docs/openapi.json`을 코드에서 재생성해 새 경로 2개와 스키마 반영. web이 `pnpm generate`로 바로 받을 수 있는 상태로 닫는다 — 완료 기준: `docs/openapi.json`에 두 경로가 있고 diff가 이번 추가분에 국한. (depends: S3)

## 검증 노트

**그릴링 중 실측한 것** (근거를 아래에 남긴다 — 실행 중 재확인 불필요)
- 저장소 전체에서 `chapter.body`에 쓰는 지점은 `manuscript_service.py:147`의 `setattr(chapter, field, value)` **하나뿐**이다. 확인: `grep -rn "\.body = " api/src/` → `manuscript_repository.py:34`의 `synopsis.body`만 걸렸고, `grep -rn "setattr(chapter"` → 위 한 곳.
- 재임베딩 판정은 `manuscript_service.py:155`의 `if "body" in changes:`이며, 값이 아니라 **키 존재**로 판정한다(같은 파일 148–154행 주석에 `ChapterUpdate(body="")`도 `{'body': ''}`로 실려 온다는 실측이 남아 있다).
- `chapters` 모델에 `created_at`/`updated_at`이 없다. 확인: `manuscript_models.py:59-92` 전체 열람 — `id`·`work_id`·`episode_id`·`title`·`order_index`·`body`·`global_seq`·`summary`가 전부다.
- 저장소에 페이지네이션 선례가 없다. 확인: `grep -rn "limit\b.*offset\|Query(.*ge=\|skip" api/src/domains/*/router/*.py` → 무관한 1건(auth 주석)만, `grep -rn "class .*ListResponse\|total\|has_more\|next_cursor" api/src/domains/*/schemas/*.py` → 0건.
- 마이그레이션 선례(`0004`의 직전 `0003_chapter_summary.py`)는 스키마 변경만 하고 데이터 백필을 하지 않는다. 이번 백필은 선례를 벗어나는 첫 사례다.

**확인 필요** (실행 중 실측할 것 — 지금은 근거 없음)
- **`now()`는 트랜잭션 시작 시각이다.** 한 트랜잭션에서 버전이 둘 생기면 `created_at`이 같아져 최신순 정렬이 불안정해진다. 지금 설계상 되돌리기의 선저장·되돌리기는 web이 **PATCH 2회**로 보내므로 트랜잭션이 다르지만, 이 전제가 코드에 못박혀 있지 않다. 정렬 tiebreak를 둘지, `clock_timestamp()`나 Python `datetime.now(UTC)`를 쓸지 실측해 정한다 — `id`는 uuid4라 tiebreak로 쓸 수 없다.
- **dedup의 "최신 버전 조회"가 같은 트랜잭션의 미커밋 행을 보는가.** SQLAlchemy autoflush 설정과 이 프로젝트의 세션 커밋 시점에 달렸다. 안 보이면 dedup이 조용히 무력해지므로 **테스트로 고정한다**(같은 요청 안에서 두 번 append를 시도하는 경로가 생겼을 때 잡히도록).
- **백필 마이그레이션의 UUID 생성 수단.** `gen_random_uuid()`(PG13+ 내장)가 이 배포의 Postgres 버전에서 쓸 수 있는지 확인하고, 안 되면 `pgcrypto` 대신 Python 루프로 채운다.
- **글자 수 규칙.** web 상태바의 숫자는 에디터 스토어의 `chars`에서 온다(확인: `manuscript.tsx:132` `const chars = state?.chars ?? 0;`). 그 값이 무엇을 세는지는 **읽지 않았다** — `char_length(body)`와 규칙이 다르면(공백·개행) 목록의 `3,412자`와 상태바가 어긋나 보인다. S3에서 확인해 서버를 맞추고, 못 맞추면 2of2로 표시 보정을 넘긴다.

**재발 위험 (직전 회고 `260805-083512`의 "다음에 다르게 할 것")**
- **목이 부작용을 재현하지 않으면 테스트가 실제 경로를 가린다** — 이 저장소에서 "테스트 초록 + 실제 경로 깨짐"이 네 번 났고 그중 둘이 백엔드였다(anyio 취소 스코프, 손조립 응답의 기본값 `None`). 이번엔 `_memory_service.index_chapter`를 목으로 막을 텐데, 그 목이 **호출 여부만** 알려주고 실제 순서(버전 append → 재임베딩)나 예외 전파를 재현하지 않는다. 재임베딩이 실패했을 때 버전이 남는지/롤백되는지를 목의 편의에 맡기지 말고 명제로 적어 테스트한다.
- **red가 된다 ≠ 옳은 것을 검증한다** — dedup 테스트가 보는 명제를 정확히 쓸 것. "직전(최신) 버전과 비교한다"가 목표이고, "어떤 버전과도 본문이 겹치지 않는다"는 다른 명제다(후자로 짜면 되돌리기가 과거와 같은 본문을 만들 때 버전이 안 생겨 불변식이 깨진다). 두 명제가 갈리는 케이스 — `X → Y → X`로 저장 — 를 테스트로 못박는다.
- **방어를 하나씩 제거해 red를 확인하는 절차는 유지**(이 저장소에서 효과가 확인된 장치). 이번 방어는 넷 — dedup, `"body" in changes`의 키 존재 판정, 요약 갱신, 백필의 `body <> ''` 제외.

## 비고
- **`chapters`에 타임스탬프가 없다** — 백필 항목의 시각은 실제 저장 시각이 아니라 마이그레이션 시각이다. 의도된 절충(ADR의 Consequences).
- eco: 새 도메인을 만들지 않고 `manuscript` 안에 넣는다(모델·repository·service·router 모두 기존 파일에 추가). 버전은 `chapter_id`만 갖고 `work_id`는 두지 않는다 — 소유권 검증이 항상 화를 먼저 거치므로 불필요.
