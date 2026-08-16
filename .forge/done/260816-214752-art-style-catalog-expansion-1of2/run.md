# RUN — 작품 화풍 카탈로그를 14종으로 늘리고 목록을 2열 그리드로 바꾼다

slug: art-style-catalog-expansion-1of2 · task 82 · part 1/2 · tdd: on
실행: 2026-08-16 · **직접 실행**(워크플로우 없음 — 3슬라이스·파일 5개 규모라 서브에이전트 비용이 작업보다 크다는 판단, fg-run "Estimate cost first")

## 슬라이스별 결과

- S1 백엔드 테스트를 14종 기대로 먼저 고친다 — ⚠ red는 계획대로 확인했으나 **계획이 몰랐던 테스트 결합이 드러나 테스트 구조를 바꿨다**(아래 발산 1)
- S2 `templates.json`에 10종 추가 — ✅ 계획대로
- S3 화풍 목록을 2열 그리드로 — ✅ 계획대로, 브라우저 실측으로 확인(아래 발산 3의 경로 변경 있음)

## 계획대로 된 것

- **red를 실제 출력으로 관측했다.** S1 직후 `uv run pytest tests/image_generation/test_template_catalog.py tests/image_generation/test_art_style_endpoints.py -q` → **82 failed, 49 passed**. 카탈로그가 4종인 상태에서 테스트만 14종을 기대하게 만든 결과다.
- **S2 후 green.** `uv run pytest tests/image_generation/ -q --no-cov` → **232 passed**.
- 게이트 전부 통과:
  - 백엔드 `uv run pytest -q --no-cov` → **1207 passed · 12 failed · 1 skipped · errors 0**. 12건은 계획의 검증 노트 5번이 예고한 `Makefile` 부재 기존 실패이며 그 집합과 정확히 일치한다(`TestMakefileHotReload` 9 + `TestMakeMigrate` 3).
  - `uv run ruff check .` → All checks passed · `uv run mypy src` → **171 files, no issues**.
  - 프론트 `pnpm typecheck` 클린 · `pnpm lint` 클린(240파일) · `pnpm test` **56 files / 395 passed**(변동 없음 — 레이아웃 변경은 테스트 수를 바꾸지 않는다).
- **실 API가 14종을 돌려준다** — `curl -s localhost:8000/api/v1/art-styles` → 14건, id 순서 `ink · webtoon · oil · photo · anime · shoujo · watercolor · pen · concept · render3d · noir · oriental · cyberpunk · darkfantasy`.

## 발산

1. **계획이 놓친 테스트 결합 — 이 실행의 가장 중요한 사건.** `test_sample_path_points_to_real_file`이 `STYLE_IDS × ENTITY_TYPES` 전 조합에 대해 **파일명 규약**과 **실제 파일 존재**를 한 테스트에서 함께 단언하고 있었다. 그대로면 part 1/2는 **단독으로 green이 될 수 없다** — 견본 30장은 part 2/2가 만들기 때문이다. 계획은 이 의존을 보지 못했고, "견본 없이도 화면은 안 깨진다"(확인한 사실 2)만 확인했지 **테스트가 견본을 요구한다는 사실은 확인하지 않았다.**
   - **고친 방식**: 두 명제를 두 테스트로 분리했다. `test_sample_path_follows_naming_convention`은 전 조합(56)에서 파일명만 보고, `test_sample_file_exists`는 `SAMPLE_COMBINATIONS` 목록의 조합에서만 존재를 본다.
   - **부수 이득**: `_NEW_STYLES_WITH_SAMPLES`를 빈 목록으로 두고 part 2/2가 견본을 채울 때 10종을 넣게 했다. **part 2/2의 완료가 이제 테스트로 고정된다** — 계획 단계에서는 없던 기계적 증거다.
2. **같은 문제의 엔드포인트 판이 하나 더 있었다.** `test_art_style_sample_urls_return_200_jpeg`가 카탈로그 전체를 돌며 견본 URL의 200을 요구했다. 견본 보유 화풍만 검사하도록 좁히고, 그 이유(새 10종은 404가 정상이며 화면은 플레이스홀더를 그린다)를 docstring에 적었다.
3. **브라우저 확인 경로를 바꿨다 — 사용자 지시.** 계획은 프로젝트 CLAUDE.md를 따라 agent-browser MCP를 전제했으나, 실행 중 사용자가 **앞으로 브라우저 작업은 `aside-browser`를 쓰라고 지시**했다. agent-browser는 별도 브라우저 프로필이라 로그인 세션이 없어, QA 계정 JWT를 발급해 `localStorage`(`sw-auth-v3`)에 주입하는 우회를 시도했고 **zustand persist가 인메모리 초기값(`accessToken: null`)으로 덮어써 실패**했다. aside-browser는 사용자의 로그인된 브라우저 위에서 동작해 이 문제가 없다 — 이미 열려 있던 art-style 탭에 attach해 바로 확인했다.
   - 이 과정에서 **계획의 검증 노트 3·4(`:3001` 격리, `@*.test` 금지)가 무의미해졌다** — aside-browser는 사용자 브라우저를 쓰므로 오리진 격리 전략 자체가 적용되지 않는다. 확인은 **읽기 전용**으로 했다(클릭·저장 없음).
4. **카드 폭이 계획의 예상보다 좁다.** 계획은 "2열이면 카드당 ~400px"로 계산했으나 실측은 **364px**이다(`gridTemplateColumns: "364px 364px"`, 컨테이너 `max-w-[820px]`에 `gap-3`). 견본 3장에 필요한 280px(썸네일 80×3 + gap 8×2 + 패딩 12×2)은 들어가므로 문제는 없지만, **카드당 ~84px의 오른쪽 여백은 남는다.** `work-art-style-2of2`의 발산 3이 지적한 "오른쪽이 크게 빈다"는 크게 완화됐을 뿐 완전히 사라지지는 않았다 — 스크린샷으로 확인한 사실이다.

## 방어를 깨뜨려 red를 확인한 것

- **S1의 red는 TDD의 red이지 방어 제거 red가 아니다** — 처음 이 절에 그것만 적었다가 훅의 지적을 받고 아래를 실제로 수행했다. (그 red 자체는 유효하다: 카탈로그를 고치기 전 테스트만 14종 기대로 바꿔 **82 failed**를 관측했고 S2로 green이 됐으니, 테스트가 카탈로그 내용을 실제로 본다는 증명이다.)
- **`test_sample_file_exists`가 방어하는지 직접 깨서 확인했다.** `_NEW_STYLES_WITH_SAMPLES`에 `"anime"`(견본이 아직 없는 화풍)을 임시로 넣고 실행 → `test_sample_file_exists[anime-character]` · `[anime-location]` · `[anime-item]` **3건이 red**(`AssertionError`, 실패 메시지가 `.../samples/anime-item.jpg`를 가리킴). 즉 이 테스트는 목록에 있다는 사실이 아니라 **파일이 실제로 있는지**를 본다. 원복 후 `232 passed` 재확인.
- **이것이 part 2/2 완료의 기계적 증거 장치다** — 지금은 기존 4종 × 4유형 = 16건이 수집돼 통과하고, part 2/2가 목록에 10종을 넣으면 46건이 되며 견본이 하나라도 비면 red가 된다.
- **하지 않은 것(정직하게)**: 2열 그리드에 대한 방어 제거 red는 확인하지 않았다. 레이아웃은 jsdom이 관측할 수 없어 클래스 문자열을 단언하는 테스트를 만들지 않기로 계획이 정했고(검증 노트 2), 그 대신 브라우저 실측이 검증 수단이다.

## 브라우저 확인 (S3의 완료 기준)

`aside-browser`로 이미 열려 있던 탭에 attach — `http://localhost:3000/works/d2a17848-…/art-style`, 좌측 내비의 `이미지 스타일`(팔레트 아이콘, 4번째).

- **DOM 실측**: `count: 14` · `display: "grid"` · `gridTemplateColumns: "364px 364px"` · `perRow: [2,2,2,2,2,2,2]` · `rowCount: 7`. **정확히 2열 × 7행.**
- **접근성 트리**: 화풍 14개가 각각 `button[aria-pressed]`로 렌더되고 라벨이 확정 목록과 일치한다. 기존 4종은 견본 3장(`수묵화 인물 견본` 등), 새 10종은 `🖼️🖼️🖼️` — **계획이 예고한 중간 상태 그대로**다.
- **스크린샷 육안 확인**: 2열로 정연하게 앉고, 이전의 전체 폭 세로 스택에서 오른쪽이 크게 비던 문제가 해소됐다(발산 4의 잔여 여백은 위에 기록).

## 후속 작업 후보

- **part 2/2 실행 시 `_NEW_STYLES_WITH_SAMPLES`(테스트)와 `styles_with_samples`(엔드포인트 테스트) 두 목록을 함께 14종으로 넓힐 것** — 두 곳이라 하나만 고치면 절반만 검증된다.
- 프로젝트 `CLAUDE.md`의 "화면 확인 — agent-browser MCP" 문단이 사용자의 새 지시(aside-browser)와 어긋난다. 문서 갱신 후보.
- 카드당 ~84px 잔여 여백(발산 4) — 견본 썸네일을 키우면 채워진다. 견본이 실제로 채워진 뒤(part 2/2) 다시 볼 일이다.
