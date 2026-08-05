---
last_mapped_commit: a72f625986e1a6220134e9645c294c50940aaeac
mapped: 2026-08-01
---

# CONCERNS — 기술 부채·알려진 결함·위험 영역

이 문서는 "개선하면 좋은 것"이 아니라 **"모르고 건드리면 이렇게 깨진다"**를 기록한다. 모든 항목은 위 커밋의 실제 코드를 읽어 확인했고, 근거가 약한 항목은 명시했다. 테스트 스위트는 실행하지 않았으므로 커버리지·실패 건수는 정적 근거(테스트 파일 존재·import 여부)로만 판정했다.

## 치명적

### 1. `requireAdmin`이 `requireAuth`의 별칭 — 관리자 권한 검사가 프론트에도 백엔드에도 없다

`web/src/features/auth/lib/guard.ts:17-19`의 `requireAdmin`은 본문이 `requireAuth(redirectTo)` 한 줄이다. 함수 주석(`:13-16`)은 "role 정보가 UserResponse에 없으므로 requireAuth와 동일하게 동작. **서버측 권한 검사로 보호된다**"고 적었지만 **그 서버측 검사는 존재하지 않는다** — `grep -rn "get_current_admin\|require_admin\|admin_required" api/src` 결과가 비어 있고, 어떤 라우터도 role을 확인하지 않는다. RBAC 스키마는 있다(`api/src/domains/auth/models/auth_models.py:86-123,170` — `Permission`/`Role`/`user_roles`), 관리자 역할 부여 경로도 있다(`api/src/domains/auth/admin_ops.py:18,47` `ADMIN_ROLE`), 그러나 그 역할을 **집행하는 코드가 한 줄도 없다.** `UserResponse`(`api/src/domains/auth/schemas/auth_schemas.py:25-37`)에도 role이 없어 프론트가 검사할 재료조차 없다(ADR-0007이 이 미노출을 명시).
**현재의 완화**: `/admin` 화면들은 실 API를 전혀 호출하지 않고(`account-approval-screen.tsx`·`admin-stats-screen.tsx` import 목록에 API 없음, 로컬 스토어만), `admin-shell.tsx:43-51`이 "백엔드 미연결 — 목업 화면" 경고를 띄운다. `/admin` 링크도 사용자 네비게이션에 없다(admin-shell 내부에만).
**위험**: 지금 유출되는 실데이터는 없지만, 이 화면에 실 API를 배선하는 순간 `requireAdmin`이 **모든 로그인 사용자를 통과시킨다**. 게다가 코드 주석이 "서버가 막아준다"고 거짓 보증하므로, 배선하는 개발자가 가드를 다시 볼 이유를 잃는다.
**급함**: 높음 — 부비트랩형 구멍이다. 배선보다 먼저 role 노출 + 서버 dependency를 만들어야 한다.

### 2. 한글 IME 조합 중 Enter 가드 누락 — 4곳, 채팅 전송이 가장 심각 (이전 지도와 동일, 미수정)

`isComposing` 가드가 **있는** 곳은 둘뿐이다: `web/src/features/works/components/keyword-tag-input.tsx:31`, `web/src/features/works/components/new-work-screen.tsx:241`. 없는 곳:
- `web/src/features/memory/components/memory-panel.tsx:649-652` — `if (e.key === 'Enter' && !e.shiftKey) { preventDefault(); send(); }`. `send()`(`:585-593`)는 `:592`에서 즉시 `chatStream.start(...)`로 실 LLM SSE 스트리밍을 시작한다.
- `web/src/features/works/components/synopsis-editor.tsx:97` — `e.key === 'Enter' && e.currentTarget.blur()` → `commitTitle`이 `renameWork` 실 API 호출.
- `web/src/features/editor/components/manuscript.tsx:280` → `commitTitle`(`:240`)이 `renameChapter` 실 API 호출.
- `web/src/components/layout/work-tree.tsx:447-450` — `InlineEdit`(`:423`)의 Enter가 `finish(true)` → `onCommit`(이름변경 API). `onBlur`(`:455`)도 같은 경로.
**위험**: 조합 확정용 Enter가 조기 전송·저장으로 새어 나간다. 채팅 케이스는 자모가 덜 붙은 문장을 실 LLM 호출로 흘려보내 비용을 쓰고, 대화 이력에 박혀 되돌릴 수 없다. 회고(`.forge/retro/260725-230947-new-work-creation-wizard.md`)가 "테스트 green이 한글 입력 검증을 대체하지 못한다"며 후속 후보로 식별했으나 그 뒤 두 릴리스가 지나도 미적용이다.
**급함**: 높음 — 고치는 비용은 `!e.nativeEvent.isComposing` 4곳 추가로 끝난다.

### 3. JWT 서명 키·앱 시크릿이 플레이스홀더 기본값이고, 프로덕션에서 이를 거부하는 가드가 없다

`api/src/core/config.py:314`(`secret_key`)와 `:353`(`jwt_secret_key`)가 각각 소스에 박힌 플레이스홀더 문자열을 기본값으로 갖는다(값은 여기 옮기지 않는다 — 파일·변수명만 기록). `jwt_secret_key`는 `api/src/domains/auth/security.py:91-92`를 통해 `:141`(access 발급)·`:174`(refresh 발급)·`:189`(검증)에서 그대로 서명 키로 쓰인다. `Settings.is_production()`(`config.py:585`)은 존재하지만 **오직 uvicorn reload 판정에만 쓰인다**(`api/src/main.py:395`, `api/src/__main__.py:31`) — 기본값 거부 validator는 없고(`field_validator`는 provider·log_level·URL 정규화용 4개뿐), `grep "change-me" api/src`는 정의 두 줄만 잡힌다.
**위험**: `.env`에 `JWT_SECRET_KEY`를 넣지 않고 배포하면 앱이 조용히 부팅하고 **공개 리포에 있는 문자열로 토큰이 서명된다** — 누구나 임의 사용자의 access token을 위조할 수 있다. 완전한 인증 우회다. 실패가 시끄럽지 않다는 점(경고 로그조차 없음)이 이 항목의 핵심이다.
**급함**: 높음 — `is_production()`일 때 기본값이면 부팅을 거부하는 `model_validator` 하나로 막힌다.

### 4. 스트리밍 훅에 언마운트 정리가 없다 — 생성 중 화면을 떠나면 토큰이 계속 청구된다

`web/src/features/memory/api/chat.api.ts:187-215`(`useChatStream`)과 `web/src/features/editor/api/assist.api.ts:163-194`(`useAssistStream`)은 둘 다 `abortRef`를 들고 있지만 **cleanup effect가 없다**(`useEffect(() => () => abortRef.current?.abort(), [])` 부재). `stop`은 명시적 버튼에서만 불린다(`memory-panel.tsx:664`). memory-panel의 네 effect(`:549,560,567,580`)는 어느 것도 cleanup을 반환하지 않는다. `chat.api.ts:178-181`의 docstring이 스스로 경고한다 — "`stop`은 중단 시 **반드시** 호출해야 한다. 부르지 않으면 SSE 생성이 끝까지 돌아 토큰이 계속 탄다(내부 AbortController는 **다음 `start()` 때야** abort된다)".
**위험**: 생성 중 라우트 이동·패널 닫기·탭 이탈로 컴포넌트가 언마운트되면 abort가 일어나지 않아 서버 생성이 완주하고, ADR `260801-014029`에 따라 **받은 분량 전체가 사용량 한도에서 차감**된다. 사용자는 "안 쓴 걸로 아는" 토큰을 낸다. 요구 계약이 "호출부가 알아서 stop을 부른다"인데 그 계약을 지키는 소비처가 하나(중단 버튼)뿐이다.
**급함**: 높음 — 훅 안에 cleanup 한 줄이면 계약 자체가 사라진다.

### 5. 엔티티 카드의 emoji·이미지·relations가 서버에 저장되지 않아 새로고침 시 조용히 사라진다

`web/src/features/shared/store/works.store.ts:470-476`의 `decorateFromInput`은 `emoji`/`imageUrl`/`relations`를 로컬 엔티티 객체에만 병합한다. `addEntity`(`:430-446`)·`updateEntity`(`:448-465`)가 백엔드로 보내는 payload에는 이 세 필드가 없고, 이유는 `web/src/features/world-bible/lib/entity-mapping.ts:7-9`(백엔드에 emoji 컬럼 없음)·`:17`·`:42-43`(relations는 `target_entity_id` UUID 참조를 요구해 자유 텍스트 name/role/tone을 못 보냄)에 적혀 있다. `works.store.ts`엔 `persist` 미들웨어가 없다(파일 전체 grep 무결과) — 순수 인메모리다.
**위험**: 세션 내에서는 `setWorkEntities`(`:140`)가 기존 로컬 값을 보존해 정상처럼 보이지만, 하드 새로고침·재로그인·다른 브라우저에서는 emoji가 유형 기본값으로 돌아가고 이미지·관계는 사라진다. 사용자에게 알리는 UI가 없어 "저장했는데 없어졌다"로 온다.
**급함**: 높음 — 사용자 입력이 조용히 유실되는 데이터 손실류 결함.

## 주의

### 6. 검증 체계에 CI가 없고, 루트에 `test` 태스크조차 없다

`.github/`가 존재하지 않는다(CI 워크플로 0개). 루트 `Taskfile.yml`의 태스크는 `default·install·dev·dev-api·dev-web·build·check·contract·contract-check`뿐 — **`test`가 없다**. 그리고 `check`(`Taskfile.yml:67-70`)는 `web:check`만 부른다: 백엔드 lint·typecheck·pytest가 전부 빠진다. api 쪽 pre-commit(`api/.pre-commit-config.yaml`)은 있으나 개발자가 `task api:pre-commit-install`을 직접 돌려야 걸린다.
**위험**: "루트에서 `task check`"라는 가장 자연스러운 검증 동작이 백엔드를 전혀 보지 않는다. 아래 7·8번(상시 실패 테스트, 실 DB 공유)이 방치될 수 있는 구조적 이유가 이것이다.
**급함**: 중간 — 다인 작업으로 넘어가는 순간 상위로 올라간다.

### 7. `api/tests/` 12건이 존재하지 않는 `Makefile`을 읽으려 해 상시 실패한다

`api/tests/test_dev_server.py:36`이 `_MAKEFILE = _PROJECT_ROOT / "Makefile"`을 잡고 `:44-45`의 `_makefile_text()`가 `read_text()`로 읽는다. 이를 쓰는 `TestMakefileHotReload`(`:132`)가 9건, `api/tests/test_migrations.py:20,25-26`의 같은 패턴을 쓰는 `TestMakeMigrate`(`:47`)가 3건이다. 그런데 `api/Makefile`은 **없다** — `api/Taskfile.yml`과 `api/Justfile`만 있다. Taskfile로 이전하며 이 두 파일만 남았다(`test_dev_server.py:216`의 `TestJustfileHotReload`는 존재하는 `Justfile`을 읽어 정상).
**위험**: `task api:test`가 항상 실패로 끝나므로 진짜 회귀가 섞여도 "또 그 Makefile 테스트"로 넘긴다 — alert fatigue의 교과서적 사례. 고치는 비용은 낮고(두 클래스 삭제 또는 Taskfile 기준 재작성) 방치 비용은 계속 커진다.
**급함**: 중간(높음에 근접) — 6번(CI 없음)과 결합해 검증 신뢰를 잠식한다.

### 8. 테스트 34개 파일이 dev용 실 PostgreSQL을 그대로 쓴다 — 테스트 전용 DB 분리가 없다

`grep -rl AsyncSessionFactory api/tests | wc -l` = **34**(전체 테스트 파일 83개 중). 예: `api/tests/works/test_works_isolation.py:17,36-44`가 실 세션으로 사용자 2명을 만들고 work를 생성·삭제한다. 루트 `api/tests/conftest.py`에는 settings 캐시·Redis 싱글턴 정리 fixture만 있고 **DB 격리 fixture가 없다** — 트랜잭션 롤백도, 스키마 분리도, 테스트 전용 URL 오버라이드도 없다. `api/.env`의 `DATABASE_URL`은 `task api:dev`가 쓰는 것과 같은 `app_db`를 가리킨다.
**위험**: 수동 QA 데이터가 있는 dev DB 위에서 이 테스트들을 돌리면 서로를 훼손한다. 정리 실패한 테스트가 남긴 계정이 dev DB에 누적된다(회고 `260725-230947`의 "dev 백엔드에 남은 일회용 QA 계정·작품 데이터 정리" 항목이 그 전례). CI를 붙이는 순간(6번) 병렬 실행에서 바로 재현된다.
**급함**: 중간.

### 9. mypy pre-commit 훅이 모든 커밋에서 조용히 skip된다

`.git/hooks/pre-commit`은 `--config=api/.pre-commit-config.yaml`로 **리포 루트에서** 실행된다(그리고 `INSTALL_PYTHON`에 머신 로컬 절대경로 `.../api/.venv/bin/python3`가 박혀 있다 — 다른 개발자 환경에선 PATH의 pre-commit 폴백에 의존). pre-commit의 `files:` 정규식은 **루트 기준 상대경로**에 매칭되므로, `api/.pre-commit-config.yaml:96`의 `files: ^src/`는 실제 경로 `api/src/...`와 절대 일치하지 않는다. 같은 훅의 `args: [src/]`도 루트에는 없는 경로다. 실측: `pre_commit run mypy --files api/src/main.py` → `(no files to check) Skipped`. 반면 같은 설정 파일의 detect-secrets(`:103`)는 `--baseline api/.secrets.baseline`로 **루트 상대경로**를 쓴다 — 루트 실행에 맞춰 일부만 적응시키고 mypy 쌍(`files`/`args`)을 놓쳤다는 증거다. `ruff`/`ruff-format`은 `files` 필터가 없어 정상 동작한다(실측: `ruff ... Passed`).
**위험**: 타입 검사가 커밋 게이트에서 완전히 빠져 있는데 훅 출력은 초록색 `Skipped`라 아무도 눈치채지 못한다. `task api:typecheck`를 따로 부르는 사람만 mypy를 본다.
**급함**: 중간 — `files: ^api/src/`+`args: [api/src/]`(또는 `entry: bash -c 'cd api && uv run mypy src/'`)로 끝난다.

### 10. 폐지된 "전체이용가 수위 검열" 흐름이 ADR·설계문서·코드 docstring·생성 SDK에 그대로 남아 있다

ADR `260730-070532`(`.forge/adr/`)가 연령·수위 제한을 제품에서 전부 제거하고 `status: supersedes ADR-0003`을 선언했다. 그런데:
- **ADR-0003이 활성 결정 집합에 그대로 있다** — `.forge/adr/0003-commercial-llm-all-ages-content-policy.md`가 여전히 `adr/` 최상위이고 `adr/retired/`에는 `0011-synopsis-as-reorderable-cards.md` 하나뿐이다. 대체 ADR 스스로 "실제 은퇴 처리는 fg-cleanup의 몫"이라 미룬 상태다.
- `docs/ai-pipeline.md`가 5·21·95·130·215-238·292행에서 수위 상한·선제 가드·자동 완화 재시도·모더레이션 흐름도를 **현행처럼** 기술한다. 6장(`:215-238`) 전체가 존재하지 않는 기능의 명세다.
- `docs/image-generation.md`도 5·24·117-140·163·169-170행에서 같은 상태다(4장 전체).
- **코드 자체도 어긋난다** — `api/src/domains/chat/router/chat_router.py:826` docstring이 "수위 검열 → (수위 통과 시) …"라고 적었지만 함수 본문(`:830-856`)에는 모더레이션 단계가 없다. `api/src/domains/moderation/service/moderation_service.py:1-19`는 책임이 "LLM 호출 실패 분류"로 축소됐음을 정확히 기록해, 두 파일이 서로 모순된다.
- 그 거짓 docstring이 **생성물로 전파됐다** — `docs/openapi.json`(POST `/api/v1/works/{work_id}/chat/messages` description)과 `web/src/api/sdk.gen.ts:425`·`web/src/api/@tanstack/react-query.gen.ts:599`가 같은 문장을 담고 있다.
**위험**: `CLAUDE.md`가 "기능을 만들기 전 `docs/` 확인"을, fg-ask가 활성 ADR을 정답 소스로 읽으라고 지시한다 — 즉 **문서를 성실히 읽는 쪽이 틀린 모델을 얻는다.** 이 문서가 사라진 모더레이션 게이트를 다시 구현하게 만들 소지가 크다.
**급함**: 중간 — 실행 결함은 아니나 다음 작업자를 확실히 오도한다. ADR 은퇴(fg-cleanup)+docs 2건+docstring 1줄+`task contract` 재생성으로 닫힌다.

### 11. 원고 전문이 30일 보관되는데, 사용자가 "동의"하는 개인정보처리방침은 존재하지 않는다

`api/src/domains/chat/models/llm_call_log.py:38-39`의 `messages`(JSONB)·`response`(Text)가 assist·chat·dynamic_update·works·relationships 경로의 모든 LLM 입출력 전문을 저장한다. 삭제는 스케줄이 아니라 INSERT 100회당 1회의 기회적 삭제다(`api/src/domains/chat/repository/llm_call_log_repository.py:26,31,35-38,75-76` — `_insert_count`는 프로세스 로컬 전역이므로 워커를 늘리면 주기가 워커별로 갈린다). 여기까지는 ADR-0009가 의도적으로 채택한 정책이며, 그 ADR이 "개인정보 고지·약관에 이 보관 사실을 반영해야 한다(후속 작업)"고 적었다. **그 후속이 아직 없다** — `web/src/features/auth/components/signup-page.tsx:152-155`는 "이용약관"·"개인정보처리방침"을 **링크가 아닌 `<span>` 텍스트**로 두고 체크박스 동의를 받고, `web/src/features/landing/components/landing-screen.tsx:493,505-508`의 푸터도 `cursor-pointer` 클래스만 붙은 `<span>`이다. 리포에 해당 문서 파일이 없다.
**위험**: 작가 원고가 운영 DB에 이중 보관되는 사실이 고지되지 않은 채 "동의" 체크만 수집된다. 클릭해도 아무 일이 없는 약관 링크는 그 자체로 신뢰·법적 리스크다.
**급함**: 중간 — ADR로 추적되는 기지의 결정이지만 후속이 릴리스마다 밀리고 있다.

### 12. 토큰 사용량 대시보드가 100% 하드코딩 — 백엔드는 실집계 중인데 읽기 API가 없다

`web/src/features/works/components/dashboard-screen.tsx:21,59,125`가 `useUsage()`로 plan·usedTokens/totalTokens를 렌더하지만 원천은 `web/src/features/shared/store/works.store.ts:10,100`이 넣는 `seedUsage`(`web/src/features/shared/mock/works.ts:3-7`, 고정 3개 값)다. 백엔드는 실제로 집계·집행한다 — `api/src/domains/budget/service/budget_service.py`가 Redis `INCRBY`로 누적하고 `get_usage`(`:47-51`)를 제공하며 `api/src/domains/budget/dependency.py:21-26`이 상한 초과 시 429로 막는다. 없는 것은 **HTTP 라우터뿐**이다(`api/src/domains/budget/`에 `router/` 디렉터리 자체가 없음 — router 없는 도메인은 budget·image_generation·moderation·shared).
**위험**: 실사용량이 90%여도 화면은 항상 같은 숫자를 보여주고, 사용자는 예고 없이 429를 맞는다. "품질 티어"·비용 관리가 제품 핵심 축인데 그 유일한 가시화가 거짓이다. 백엔드에 이미 데이터가 있으니 격차는 라우터 하나다.
**급함**: 중간.

### 13. `main.py`가 13개 라우터를 `try/except ImportError`로 감싸 조용히 흘린다

`api/src/main.py`의 라우터 등록이 240·249·258·267·276·285·297·309·321·333·345·354·363행에서 `except ImportError: logger.debug(..., note="Will be added in later phase")`로 끝난다. 도메인 안의 어떤 모듈에 import 오류(오타·순환 import·누락 의존성)가 생기면 **그 도메인 전체가 등록되지 않은 채 앱이 정상 부팅**하고, 흔적은 DEBUG 레벨 로그 한 줄뿐이다.
**위험**: `/health`·`/ready`는 초록불이고 프론트는 404만 받는다. 원인 추적이 프론트→네트워크→백엔드 라우팅 순으로 몇 시간 새는 종류의 장애다. `except ImportError`가 초기 스캐폴딩의 잔재인데(`"later phase"`) 13개 도메인이 모두 실재하는 지금은 순수한 손해다.
**급함**: 중간 — 도메인이 실재하는 이상 try를 걷어내는 것이 정답이다.

### 14. "설정 충돌 무시(dismiss)"가 서버에 저장되지 않아 다시 조회하면 되살아난다

`web/src/features/shared/store/works.store.ts:206-210`의 `dismissConflict`는 `work.conflicts` 로컬 배열 필터링뿐이고 API 호출이 없다. 소비처는 `web/src/features/timeline/components/timeline-screen.tsx:8,45` 하나다. 백엔드 `api/src/domains/timeline/`·`api/src/domains/conflicts/`에 dismiss 상태를 담을 필드·엔드포인트가 없다(`grep -rln dismiss` 무결과). 충돌 목록은 `web/src/features/timeline/lib/hydrate-conflicts.ts`가 화면 진입마다 서버에서 다시 조립한다.
**위험**: "이 충돌은 의도된 것"이라는 사용자 판단이 세션에만 남는다. 새로고침·재진입마다 같은 경고가 다시 뜨고, 반복 경고는 경고 전체의 신뢰를 깎는다.
**급함**: 중간.

### 15. OAuth 어댑터 3종에 테스트가 하나도 없다

`api/src/domains/auth/oauth/google.py`(94줄)·`kakao.py`(82줄)·`naver.py`(80줄) 어느 것도 `api/tests/` 어디에서도 import되지 않는다(`grep -rn "domains.auth.oauth" tests` 무결과 — 유일한 참조는 `auth_router.py:430,435,440`의 지연 import와 google.py 자기 docstring). `api/tests/auth/conftest.py:294-326`의 fake repository는 `get/create/update_oauth_account`를 갖고 있어 **서비스 계층 프로비저닝만** 검증된다 — state 검증, 코드↔토큰 교환, 프로바이더별 에러·프로필 응답 파싱은 전부 미검증이다.
**위험**: 소셜 로그인 콜백 경로의 회귀가 테스트로는 잡히지 않는다. 인증 경로라 실패 시 파급이 크고, 프로바이더별 응답 형태 차이는 정확히 테스트가 필요한 종류다.
**급함**: 중간 — 소셜 로그인이 실제 트래픽을 받기 시작하는 시점에 상위로 올라간다.

### 16. 작품 진입 시 화 하이드레이션이 `1 + 부 수 + 화 수`번 요청을 낸다

`web/src/features/editor/lib/hydrate-chapters.ts:46-63`의 `fetchWorkChapters`는 (a) 부 목록 1회, (b) 부마다 화 목록 1회, (c) **화마다** `hydrateChapter`(`:21-41`)가 `worldBibleApi.chapterLinks`를 1회 호출한다. 화별 링크 조회가 필요한 이유는 주석(`:19-20`)에 있다 — 화 조회 응답에 링크가 없어서 빼면 reload 시 저장된 설정 참고가 빈 배열로 덮인다.
**위험**: 연재물은 화가 수백 개로 자라는 도메인이다. 100화 3부 작품이면 작품 진입 한 번에 HTTP 요청 104개 — 브라우저 동시 연결 한도에 걸려 진입이 눈에 보이게 느려지고, 각 요청이 소유권 확인 쿼리를 동반해 백엔드 부하도 선형 증가한다. 지금은 시드 데이터가 작아 증상이 없다.
**급함**: 중간 — 근본 해법은 화 응답에 링크를 포함하는 백엔드 변경이다.

### 17. accessToken·refreshToken을 localStorage에 보관

`web/src/features/auth/store/auth.store.ts:16-30`이 zustand `persist`(기본 localStorage, `{ name: 'sw-auth-v3' }`)로 두 토큰을 그대로 영속화한다. ADR-0007이 MVP 결정으로 명시 채택하며 "XSS 위험 감수"와 업그레이드 경로(백엔드 httpOnly 쿠키 전환)까지 적어둔, **의도된** 트레이드오프다. 현재 저장소 전체에 `dangerouslySetInnerHTML` 사용처는 없다(grep 무결과).
**위험**: XSS가 하나라도 생기면 refresh token까지 유출돼, 사용자가 로그아웃/비밀번호 변경을 하지 않는 한 세션을 끊을 수 없다. TipTap 등 리치 에디터 산출 HTML을 나중에 어딘가에서 그대로 렌더하게 되면 즉시 벡터가 된다.
**급함**: 낮음(현재 알려진 XSS 벡터 없음). 근거가 정적 grep 한정이라 확신도는 중간.

### 18. "부(Part)"가 자유 문자열이라 라벨이 겹치면 트리에서 병합되고, 이름변경이 서버와 어긋난다

`web/src/features/shared/store/works.store.ts:253` 주석이 자인한다 — `// ponytail: 부는 partLabel 문자열일 뿐이라 "제N부"가 이미 있으면 트리에서 병합됨. mock 단계 수용.` `addPart`(`:254-267`)는 `partCount = new Set(chapters.map(c => c.partLabel)).size`(`:257`)로 다음 번호를 만들므로 라벨 충돌 시 번호 계산 자체가 틀린다. 더 나쁜 것은 `renamePart`(`:269-285`)다 — 서버에는 `oldLabel`로 **먼저 찾은 하나의** `episodeId`만 PATCH하고(`:271-274`), 로컬에서는 `oldLabel`과 같은 **모든** 화의 `partLabel`을 바꾼다(`:281-283`). 같은 라벨의 부가 둘이면 로컬과 서버가 갈린다.
**위험**: 사용자가 부 이름을 바꾸다 우연히 기존 라벨과 겹치면 트리에서 화들이 뒤섞여 "화가 사라졌다"로 보이고, 새로고침하면 또 다른 상태가 나온다. 그룹핑 키가 `episodeId`가 아니라 표시 문자열인 것이 근본 원인이다.
**급함**: 중간 — 코드 주석에 명시된 채 수용된 부채다.

## 사소

### 19. [해소됨] AI 이어쓰기 후보 UI 이중화 — 파서·렌더 계약이 통일됐다

이전 지도가 "스트리밍 원문 노출 여부가 갈린 두 벌"로 기록한 항목은 커밋 `e8898de`로 정리됐다. 현재 `web/src/features/editor/components/suggestion-picker.tsx`의 `SuggestionPicker`(`:22`, 팝오버)와 `ContinueSuggestionModal`(`:90`, 모달)은 **둘 다** `parsePartialSuggestions`(`web/src/features/editor/lib/parse-suggestions.ts:100`)를 써서 경계가 확정된 후보만 카드로 렌더하고 자라는 후보는 스켈레톤 1개로 표시한다 — 원문 스트림을 노출하는 쪽은 더 이상 없다. 남은 차이는 컨테이너(팝오버/모달)뿐인 의도된 표현 차이다. 잔여 부채는 후보 카드 마크업이 두 컴포넌트에 거의 그대로 중복된다는 것(`:43-57` vs `:121-135`)뿐이다.
**급함**: 낮음.

### 20. 후보 파서의 최종 폴백이 응답 전문을 후보 1개로 내보낸다

`web/src/features/editor/lib/parse-suggestions.ts:81`의 `parseCandidatesObject(text) ?? parseByLabel(text) ?? [text.trim()]`. 같은 파일 `:11`의 주석이 라벨 표류를 "DB 로그로 40% 실측"이라 적었다 — 즉 계약(JSONL) 위반이 드문 일이 아니다. 4계층을 다 놓치면 서론·마무리 멘트를 포함한 응답 전체가 하나의 "후보"로 카드에 뜬다.
**급함**: 낮음(의도된 관용 설계) — 다만 40%라는 실측치는 백엔드 프롬프트(`api/src/domains/assist/service/prompt_assembler.py:39-41`) 강화의 근거가 된다.

### 21. `/docs`·`/redoc`·`/openapi.json`이 환경 구분 없이 항상 열려 있다

`api/src/main.py:124-126`이 세 경로를 무조건 지정한다 — `settings.is_production()` 분기가 없다. 인증도 걸려 있지 않다.
**위험**: 프로덕션에서 전체 API 표면(53개 경로, 요청/응답 스키마)이 익명에게 공개된다. 그 자체가 취약점은 아니지만 공격 표면 정찰을 무료로 제공한다.
**급함**: 낮음 — 프로덕션에서 `None`으로 넘기는 한 줄.

### 22. `image_generation` 도메인에 프로덕션 호출자가 없다

`api/src/domains/image_generation/service/image_generation_service.py`(31줄)의 `map_character_to_prompt`/`map_location_to_prompt`를 참조하는 코드는 자기 테스트(`api/tests/image_generation/test_image_generation_service.py`)뿐이다 — `grep -rn image_generation api/src` 결과에 도메인 자기 파일 외 호출자가 없다. 라우터도 없다. 프론트는 아예 별개로 mock을 쓴다(27번).
**급함**: 낮음 — POC 잔재. 지우기보다 "미배선"임을 아는 게 중요하다.

### 23. `test_stream_cancel_shield.py`가 정책의 유일한 방어선인데 포트를 고정 점유한다

ADR `260801-014029`가 명시한다 — `anyio.CancelScope(shield=True)`(`api/src/domains/assist/router/assist_router.py:231`, `chat_router.py:725`, `manuscript_router.py:184`) 없이는 취소 시 차감이 **아무 일도 안 하는데 단위 테스트는 통과한다.** 그래서 `api/tests/test_stream_cancel_shield.py`가 실 uvicorn+실 SSE로 운영 경로를 재현한다. 그 테스트는 `:32`에서 `_PORT = 8933`을 하드코딩한다.
**위험**: 두 방향의 취약성 — (a) 이 테스트를 "느리다/무겁다"고 지우면 하드 쿼터가 조용히 무력화된다(ADR가 경고), (b) 8933이 점유된 환경이나 네트워크가 막힌 CI 컨테이너에서는 이 테스트가 인프라 이유로 깨져 위 (a)를 유발한다.
**급함**: 낮음 — 파일 상단 경고 주석과 동적 포트 할당으로 둘 다 완화된다.

### 24. 취소된 부분 답변이 작품 챗 컨텍스트에 영구 누적된다

`api/src/domains/chat/router/chat_router.py:853-859`가 대화 이력의 모든 `assistant` 행을 `LCAIMessage`로 넣고 `finish_reason` 필터가 없다. ADR `260801-072534`가 이를 **의도적으로 채택**하고 비용("잘린 문장이 컨텍스트에 누적된다")과 되돌리는 법("조립 지점 2곳만 고치면 된다")까지 기록했다. 같은 ADR이 "작품 챗 취소 시 부분 메시지 저장은 그릴링을 거치지 않았으므로 제품상 옳은지 별도 확인 필요"라는 미해결 질문도 남겼다.
**급함**: 낮음 — 기지의 감수 사항. 대화가 길어질 때 실측으로 판단할 항목.

### 25. jsdom cmdk 폴리필이 두 테스트 파일에 복붙돼 있다

`web/src/features/works/components/__tests__/genre-select.test.tsx:7-18`과 `new-work-screen.test.tsx:29-40`이 `scrollIntoView`/`ResizeObserver` 스텁을 사실상 동일하게 반복한다(`GenreSelect`가 cmdk 기반). `web/src/test/setup.ts`는 `import '@testing-library/jest-dom'` 한 줄뿐이라 승격 여지가 있다. `manuscript.test.tsx:171`·`suggestion-picker.test.tsx:367-369`의 `scrollIntoView` 처리는 원인이 달라(TipTap의 `Range.getClientRects` 부재) 같은 리팩터 대상이 아니다.
**급함**: 낮음.

### 26. Base UI `Button`을 `<Link>`로 렌더할 때 `nativeButton={false}`가 빠진 곳이 3군데

`web/src/components/ui/pagination.tsx:43`은 정확히 넘기는데, `web/src/features/landing/components/landing-screen.tsx:122,475,479`와 `web/src/components/layout/user-menu.tsx:38`은 `<Button render={<Link .../>}>`를 쓰면서 이 prop이 없다(이전 지도가 놓친 `user-menu.tsx` 포함). 라이브 QA에서 발견된 Base UI 콘솔 경고로, 기능은 동작하지만 접근성 시맨틱 가정이 어긋난다.
**급함**: 낮음.

### 27. `work-mapping.ts`의 주석이 현재 구현과 어긋난다

`web/src/features/works/lib/work-mapping.ts:4`는 "챕터·엔티티·타임라인·충돌은 백엔드 하위 도메인 미구현"이라 적었지만 `api/src/domains/{manuscript,worldbible,timeline,relationships}`가 전부 구현돼 있고 `hydrate-chapters.ts`·`hydrate-entities.ts`·`hydrate-timeline.ts`·`hydrate-conflicts.ts`가 각각 채운다. `toWork()`가 빈 배열로 시작하는 진짜 이유는 "화면 진입 후 별도 쿼리로 채우는 아키텍처"다.
**급함**: 낮음 — 동작 무영향, 순수 주석 정확성.

### 28. `order_index`의 0-based/1-based 혼재 규약

`web/src/features/editor/lib/hydrate-chapters.ts:53-58` 주석이 명시한다 — 생성 시 1-based, 재정렬 시 0-based(`api/src/domains/manuscript/service/manuscript_service.py:168-169`가 `enumerate` 기반으로 재부여)로 섞여 그대로 표시하면 "0화"가 나온다. 현재 프론트는 항상 로컬에서 1-based로 재계산해 우회하므로 **무증상**이다(`hydrate-chapters.ts:56-58`, `works.store.ts`의 재정렬 로직).
**급함**: 낮음 — 규약을 모르는 다음 작업자가 백엔드 `orderIndex`를 검증 없이 표시하면 즉시 재현되는 함정.

### 29. 엔티티 이미지 생성은 결정적 mock — 사용자에게는 고지된다

`web/src/features/world-bible/components/entity-form.tsx:64-71`이 실 생성 대신 data-uri SVG 플레이스홀더(`makePlaceholder`, `:329`)를 만들고 `:70`에서 "이미지를 생성했습니다 (목업)" 토스트를 띄운다. 위 항목들과 달리 **숨겨진 문제가 아니다**. 실 생성 API가 미배선이라는 사실만 기록한다(22번과 짝).
**급함**: 낮음.

### 30. 라우트 가드가 Zustand 하이드레이션 타이밍에 의존해, 렌더 스냅샷을 우회하는 워크어라운드로 버틴다

`web/src/routes/works/$workId.tsx:27-35`가 렌더 시점에 캡처된 `work` 대신 `useWorksStore.getState()`를 **명령형으로** 읽는다 — 주석(`:27-30`)이 이유를 적었다: `useHydrateWorks`의 `setWorks`가 이 effect보다 먼저 커밋되므로 클로저는 한 틱 뒤처지고, 그러면 존재하는 작품을 "없음"으로 판정해 `/works`로 튕긴다. 같은 계열 경합이 read 라우트에도 있어(`web/src/routes/works/$workId/read/`) 회귀 테스트 세 건이 이를 고정한다(`work-id-hydration-race.test.tsx`, `read-hydration-race.test.tsx`의 3 케이스).
**위험**: "아직 안 채워짐"과 "존재하지 않음"이 구분 불가한 상태 모델(`CLAUDE.md`가 말하는 "UI 우선 mock-store" 단계의 구조적 대가)이다. 새 라우트 가드를 추가하는 사람이 이 패턴을 모르고 `useWork(workId)` 반환값으로 판정하면 무작위로 튕기는 버그가 재발한다.
**급함**: 낮음(테스트로 고정됨) — 다만 함정의 위치를 알아야 한다.
