---
last_mapped_commit: 7f35fc5860ac13864ac0c1ca8638c27066e8361f
mapped: 2026-07-28
---

# CONCERNS — 기술 부채·알려진 결함·위험 영역

이 문서는 "개선하면 좋은 것"이 아니라 **"모르고 건드리면 이렇게 깨진다"**를 기록한다. 각 항목은 실제 코드·테스트 실행 결과로 확인했다. 근거가 약한 항목은 명시했다.

## 치명적

### 1. "계정 승인(Account Approval)" 게이팅이 백엔드에 아예 없다 — 완전 프론트 목업

`.forge/CONTEXT.md:79`는 계정 승인을 "초기 테스트 기간 동안 승인된 계정만 서비스를 쓸 수 있게 하는 게이팅 수단"으로 정의한다. 그러나 `api/src/domains/auth/` 전체를 뒤져도 `approval_status`/`pending`/`approve` 관련 모델 필드·서비스·라우터가 **하나도 없다**(`grep -rn "approval_status\|ApprovalStatus" api/src` 결과 없음). 로그인은 `api/src/domains/auth/service/auth_service.py:248`의 `if not user.is_verified:` 하나만 검사하며, 이는 이메일 인증이지 승인이 아니다(`api/src/domains/auth/admin_ops.py:7-9`가 이 둘을 명시적으로 구분). `api/src/domains/auth/admin_ops.py`는 HTTP 엔드포인트가 아니라 `scripts/manage.py` 전용 CLI 함수다.
프론트는 `web/src/features/admin/store/admin.store.ts:1-26`가 `seedMembers`(로컬 배열)만 `approveMember`/`rejectMember`로 뮤테이트할 뿐 API 호출이 전혀 없고, `web/src/features/admin/types.ts:1`은 스스로 "관리자 화면 도메인 타입 (목업)"이라 적어놨다.
**위험**: 이메일 인증만 마치면 누구나 정식 기능을 전부 쓸 수 있다. `.forge/CONTEXT.md`만 읽고 "승인 대기 계정은 막혀 있겠지"라고 가정하면 틀린다. 비공개 베타 게이팅이 필요한 시점에 이 문서를 안 보고 배포하면 그대로 노출된다.
**급함**: 높음 — 제품 문서가 약속하는 접근 통제가 실재하지 않는다.

### 2. 한글 IME 조합 중 Enter 가드 누락 — 4곳, 그중 채팅 전송이 가장 심각

`isComposing` 가드가 있는 곳: `web/src/features/works/components/keyword-tag-input.tsx:31`, `web/src/features/works/components/new-work-screen.tsx:241`. 가드가 **없는** 곳:
- `web/src/features/memory/components/memory-panel.tsx:647-651` — `if (e.key === 'Enter' && !e.shiftKey) { … send(); }`. `send()`(584-591)는 즉시 `chatStream.start(...)`로 실 LLM 스트리밍 호출을 실행한다.
- `web/src/features/works/components/synopsis-editor.tsx:97` — `onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}` → `commitTitle`(54-61)이 `renameWork` 실 API 호출.
- `web/src/features/editor/components/manuscript.tsx:229` → `commitTitle`(189-196)이 `renameChapter` 실 API 호출.
- `web/src/components/layout/work-tree.tsx:437-445` — `InlineEdit`의 Enter가 `finish(true)` → `onCommit` 콜백(이름변경 API).
**위험**: 한글 조합 중 후보 확정을 위해 Enter를 누르면(일부 IME/브라우저 조합) 조기 전송·저장이 발생한다. 채팅 전송 케이스는 자모가 덜 붙은 문장을 실제 LLM 호출로 흘려보내 비용을 낭비하고, 사용자는 되돌릴 수 없다(이미 대화 이력에 박힘). 이 문제는 같은 저장소 작업(`.forge/retro/260725-230947-new-work-creation-wizard.md`)에서 "테스트 green이 한글 입력 검증을 대체하지 못한다"는 결론과 함께 **후속 작업 후보로 이미 식별**돼 있으나 아직 미적용이다.
**급함**: 높음 — 특히 memory-panel.tsx는 "매일 쓰는 경로"(원 회고 문서의 표현).

### 3. 엔티티 카드의 emoji·이미지·relations가 서버에 저장되지 않아 새로고침 시 조용히 사라진다

`web/src/features/shared/store/works.store.ts:469-475`의 `decorateFromInput`은 `emoji`/`imageUrl`/`relations`를 로컬 엔티티 객체에만 병합한다. `addEntity`(430-446)·`updateEntity`(448-465)가 실제로 백엔드에 보내는 payload(433-439, 452-457)에는 이 세 필드가 없다 — `entity-mapping.ts:7-9,17,42-43`가 각각의 이유(백엔드에 emoji 컬럼 없음 / relations는 target_entity_id 참조 형태라 자유 텍스트를 못 보냄)를 명시한다. `web/src/features/auth/store/auth.store.ts`류의 `persist` 미들웨어가 `works.store.ts`엔 없다(전량 grep 결과 없음) — 즉 저장은 순수 인메모리다.
**위험**: 세션 내에서는 `setWorkEntities`(140-155)가 기존 로컬 값을 보존해 잘 동작하는 것처럼 보이지만, 하드 새로고침·재로그인·다른 브라우저 세션에서는 emoji/이미지/relations가 기본값으로 리셋되거나 사라진다. 사용자에게 이 사실을 알리는 UI 표시가 전혀 없어 "저장했는데 없어졌다"는 버그 리포트로 이어지기 쉽다.
**급함**: 높음 — 사용자 입력이 조용히 유실되는 데이터 손실류 결함.

### 4. `api/tests/` 12건이 Makefile 부재로 상시 실패한다 (전체 스위트: 12 failed, 925 passed, 1 skipped)

`task test` 실행 결과로 직접 확인: `api/tests/test_dev_server.py::TestMakefileHotReload`(9건)와 `api/tests/test_migrations.py::TestMakeMigrate`(3건, `test_migrate_target_waits_for_local_postgres`/`test_migrate_target_applies_alembic_head_with_uv`/`test_dev_bootstrap_runs_migrate_before_uvicorn`)가 `api/Makefile`을 `Path.read_text()`로 직접 읽으려다 `FileNotFoundError`로 실패한다. 저장소엔 `api/Makefile`이 없고 `api/Taskfile.yml` + `api/Justfile`만 있다(`ls api` 확인) — Taskfile로 이전하면서 이 두 테스트 파일만 안 지워졌다. 커버리지는 79.71%(임계 70% 통과)로 이 12건과 무관하게 정상.
**위험**: `task test`가 항상 실패로 끝나므로, 진짜 회귀가 섞여 들어와도 "또 그 Makefile 테스트겠지"로 무시하게 된다 — 신호 오염(alert fatigue)의 전형.
**급함**: 높음 — 고치는 비용은 낮음(두 파일 삭제 또는 Taskfile 기준으로 재작성), 방치 비용은 계속 커진다.

## 주의

### 5. `api/tests/`가 dev용 실 PostgreSQL을 공유한다

대부분의 도메인 테스트는 `FakeXxxRepository`(예: `api/tests/works/conftest.py`)로 in-memory 검증하지만, `api/tests/works/test_works_isolation.py:17,36-44`는 `core.database.AsyncSessionFactory`/`engine`을 그대로 써서 **실 DB**에 사용자 2명을 만들고 work를 생성·삭제한다(테스트 종료 후 cascade delete는 하지만). `api/.env`의 `DATABASE_URL`은 `task dev`가 쓰는 것과 동일한 `app_db`(`docker-compose.yml` postgres 컨테이너, 확인 시 3일째 기동 중)다 — 테스트 전용 DB/스키마 분리가 없다. 실제로 `.forge/retro/260725-230947-new-work-creation-wizard.md`의 "후속 작업 후보"에 "dev 백엔드에 남은 일회용 QA 계정·작품 데이터 정리"가 남아 있어, 라이브 QA와 자동 테스트가 같은 DB를 오염시킨 전례가 이미 있다.
**위험**: 개발자가 수동으로 dev DB에 데이터를 만들어 둔 상태에서 이 테스트들(또는 마이그레이션 스크립트)을 병렬로 돌리면 서로의 데이터를 훼손할 수 있다.
**급함**: 중간 — 지금 당장 깨지진 않지만 CI를 실 DB 위에서 병렬 실행하면 바로 재현된다.

### 6. LLM 호출 로그가 원고 전문을 30일간 원문 그대로 저장한다

`api/src/domains/chat/models/llm_call_log.py:38-39`의 `messages`(JSONB)·`response`(Text) 컬럼이 `assist·chat·dynamic_update·works·relationships` 5개 도메인의 모든 LLM 호출 입출력 전문을 저장한다(`api/src/domains/chat/repository/llm_call_log_repository.py`). 이는 `.forge/adr/0009-llm-call-log-retention.md`가 의도적으로 채택한 정책(운영자 한정 접근, 30일 후 삭제)이라 "몰래" 하는 일은 아니지만, ADR 본문이 스스로 "개인정보 고지·약관을 정비할 때 이 보관 사실을 반영해야 한다(사용자 대면 문구는 후속 작업)"이라고 명시 — 즉 **아직 반영 안 됨**. 삭제도 정확한 스케줄이 아니라 "INSERT 100회당 1회" 기회적 삭제(`llm_call_log_repository.py:27-34`)라 호출이 뜸한 기간엔 만료 행이 남아있을 수 있다(ADR도 인지하고 감수한 트레이드오프).
**위험**: "작가 원고를 모델 학습에 쓰지 않는다"는 약속과는 별개로, 원고 전문이 운영 DB에 이중 보관된다는 사실이 아직 사용자에게 고지되지 않았다.
**급함**: 중간 — 법적/신뢰 리스크이나 이미 ADR로 추적되는 기지의 결정이다.

### 7. 토큰 사용량(usage) 대시보드가 100% 하드코딩 — budget 백엔드 도메인엔 HTTP 라우터 자체가 없다

`web/src/features/works/components/dashboard-screen.tsx:21,59,125`가 `useUsage()`로 읽어 "plan · usedTokens/totalTokens 토큰"을 렌더하는데, 그 원천은 `web/src/features/shared/store/works.store.ts:10,100`의 `seedUsage`(정적 목업, `features/shared/mock/works.ts`)다. 백엔드 `api/src/domains/budget/`엔 `dependency.py`(레이트리밋용 FastAPI dependency)와 `service/`만 있고 `router/` 디렉터리 자체가 없다(`find src/domains/budget` 확인) — 즉 프론트에 노출할 API가 아직 없다.
**위험**: 사용자가 실제로 얼마나 썼는지와 무관하게 화면엔 항상 같은 숫자가 뜬다. "품질 티어"·비용 관리가 제품 핵심 축인데, 이 화면을 보고 실사용량으로 오인하면 과금/한도 관련 문의로 이어질 수 있다.
**급함**: 중간 — 화면은 동작하지만 표시값이 사실이 아니다.

### 8. AI 이어쓰기 후보 선택 UI가 두 벌 공존하고, 소비처가 갈린다

`web/src/features/editor/components/suggestion-picker.tsx`에 인라인 `SuggestionPicker`(스트리밍 원문을 그대로 노출, 완료 후 후보 카드로 파싱)와 모달 `ContinueSuggestionModal`(원문 비노출, 후보별 스켈레톤)이 함께 정의돼 있다. 소비처: `SuggestionPicker`는 `synopsis-editor.tsx:3,123`와 `selection-ai-menu.tsx:2,91`(본문 선택 후 다시쓰기/늘리기/줄이기/톤변경) 2곳, `ContinueSuggestionModal`은 `manuscript.tsx:36,390`(메인 "AI 이어쓰기") 1곳이다.
**위험**: 같은 개념(AI 후보 제시)에 UX 패턴이 갈려 있어, 다음에 4번째 소비처를 추가할 개발자가 "어느 쪽이 표준이냐"를 판단할 근거가 코드에 없다. 스트리밍 원문 노출 여부는 프라이버시/완성도 체감에 영향을 주는 의도적 차이일 수도, 그냥 발산된 결과일 수도 있다 — 이 문서만으론 의도 여부를 단정할 근거가 약하다.
**급함**: 낮음 — 지금 당장 버그는 아니나 UX 일관성 부채.

### 9. "설정 충돌 무시(dismiss)"가 서버에 저장되지 않는다 — 다시 조회하면 되살아난다

`web/src/features/shared/store/works.store.ts:206-210`의 `dismissConflict`는 `work.conflicts`에서 로컬 배열 필터링만 하고 API 호출이 없다(스토어 전체에서 `dismiss` 관련 API 호출 grep 결과 없음). 소비처는 `web/src/features/timeline/components/timeline-screen.tsx:8,45` 하나뿐이다. 백엔드 `api/src/domains/timeline/`·`api/src/domains/conflicts/`에도 "dismiss"/무시 상태를 저장할 필드·엔드포인트가 없다(`grep -rln dismiss src/domains/timeline src/domains/conflicts` 결과 없음). 충돌 목록은 `web/src/features/timeline/lib/hydrate-conflicts.ts:40`가 화면 진입마다 서버에서 다시 조회해 조립한다.
**위험**: 사용자가 "이 충돌은 의도된 거야"라며 무시 버튼을 눌러도 그 판단은 세션에만 남는다. 페이지를 새로고침하거나 다른 화로 갔다 오면 같은 경고가 다시 뜬다 — 반복 경고로 신뢰를 잃는 UX 결함이며, 뒤로 갈수록 "무시해도 안 없어진다"는 사용자 불만으로 이어지기 쉽다.
**급함**: 중간.

### 10. OAuth 어댑터(google/kakao/naver) 0% 테스트 커버리지, auth/chat 라우터도 절반이 미검증

`uv run coverage report --include="*/oauth/*"` 직접 실행 결과: `google.py`(31 stmts) `kakao.py`(33 stmts) `naver.py`(32 stmts) 전부 **0%**. 전체 커버리지 리포트(`uv run coverage report --sort=cover`)에서도 `api/src/domains/auth/router/auth_router.py`가 50%(60/130 미실행, OAuth 분기 429-444 포함), `api/src/domains/chat/router/chat_router.py`(SSE 스트리밍 핵심 라우터)가 54%(306줄 중 126줄 미실행)로 낮다.
**위험**: 소셜 로그인 콜백(state 검증, 토큰 교환, 프로바이더별 에러 처리)과 채팅 스트리밍 라우터의 절반 가까운 분기가 자동 테스트로 한 번도 실행되지 않는다 — 이 경로에서 회귀가 나도 `task test`가 초록불을 준다.
**급함**: 중간 — 소셜 로그인이 실제로 쓰이기 시작하는 시점에 우선순위가 올라간다.

### 11. accessToken·refreshToken을 localStorage에 저장

`web/src/features/auth/store/auth.store.ts:16-30`가 zustand `persist`(기본 저장소 localStorage)로 `accessToken`/`refreshToken`을 그대로 영속화한다(`{ name: 'sw-auth-v3' }`). 저장소 전체에서 `dangerouslySetInnerHTML` 사용처는 없었다(grep 결과 없음, 확인 시점 기준 XSS 벡터 미발견) — 다만 TipTap 등 리치 에디터가 생성하는 HTML을 이후 어딘가에서 그대로 렌더링하게 되면(현재는 미확인) 이 저장 방식이 즉시 세션 탈취 벡터가 된다.
**위험**: httpOnly 쿠키가 아니므로, 향후 XSS가 하나라도 생기면 refresh token까지 함께 유출되어 로그아웃/비밀번호 변경 없이는 세션을 끊을 수 없다.
**급함**: 낮음(현재 알려진 XSS 벡터 없음) — 근거는 정적 grep 한정이라, 확신도는 중간.

### 12. "부(Part)"가 자유 문자열이라 동일 라벨이면 트리에서 병합된다

`web/src/features/shared/store/works.store.ts:253` 코드 주석이 스스로 인정: `// ponytail: 부는 partLabel 문자열일 뿐이라 "제N부"가 이미 있으면 트리에서 병합됨. mock 단계 수용.` `addPart`(254-267)가 `제${partCount+1}부`를 새 제목으로 생성하는데, `partCount`는 `new Set(chapters.map(c => c.partLabel)).size`로 계산한다 — `renamePart`(269-285)로 라벨을 수동으로 바꿔 우연히 기존 "제N부"와 같은 문자열이 되면, 서로 다른 `episodeId`를 가진 두 부가 화면 트리에서 하나로 합쳐 보인다(그룹핑 키가 `episodeId`가 아니라 `partLabel` 문자열이기 때문).
**위험**: 사용자가 부 이름을 자유롭게 바꾸다 우연히 충돌하면, 트리에서 화들이 뒤섞여 보여 "화가 사라졌다"는 오인을 유발할 수 있다.
**급함**: 중간 — 이미 알려진 채로 mock 단계 수용된 부채(코드 주석에 명시).

## 사소

### 13. jsdom cmdk 폴리필이 2개 테스트 파일에 중복

`web/src/features/works/components/__tests__/genre-select.test.tsx:7-18`와 `new-work-screen.test.tsx:29-40`가 `scrollIntoView`/`ResizeObserver` 스텁을 토씨 하나 다르지 않게 복붙했다(`GenreSelect`가 cmdk 기반이라 jsdom에 없는 API를 요구). `src/test/setup.ts`로 승격하면 없앨 수 있는 중복이며, 원 작업 회고(`.forge/retro/260725-...md`)에 "잔여 부채"로 이미 기록돼 있다. `manuscript.test.tsx:163-164`/`suggestion-picker.test.tsx:324-327`의 `scrollIntoView` 스텁은 원인이 달라(TipTap의 `Range.getClientRects` 부재) 같은 리팩터 대상이 아니다.
**급함**: 낮음.

### 14. Base UI `Button`을 `<Link>`로 렌더링하면서 `nativeButton={false}`를 빠뜨림

`web/src/components/ui/pagination.tsx:41`은 `Button`을 `<a>`로 렌더할 때 `nativeButton={false}`를 정확히 넘기는데, `web/src/features/landing/components/landing-screen.tsx:122,475,479`는 `<Button render={<Link .../>}>`를 3곳에서 쓰면서 이 prop이 없다. 라이브 QA 중 발견된 Base UI 콘솔 경고(`.forge/retro/260725-...md` "잔여 부채/후속 작업" 항목)로, 기능은 동작하지만 접근성 시맨틱 가정이 어긋난다.
**급함**: 낮음.

### 15. `work-mapping.ts`의 주석이 현재 구현과 어긋난다

`web/src/features/works/lib/work-mapping.ts:4`는 "챕터·엔티티·타임라인·충돌은 백엔드 하위 도메인 미구현"이라 적었지만, 실제로는 `api/src/domains/{manuscript,worldbible,timeline,relationships}`가 전부 구현돼 있고, `web/src/features/editor/lib/hydrate-chapters.ts` 등 별도 hydrate 훅이 이들을 채운다. `toWork()`가 빈 배열로 시작하는 진짜 이유는 "화면 진입 후 별도 쿼리로 채우는 아키텍처"이지 "백엔드 미구현"이 아니다 — 주석이 과거 상태를 그대로 두고 있어 읽는 사람을 오도한다.
**급함**: 낮음 — 동작엔 영향 없음, 순수 주석 정확성 문제.

### 16. `order_index`의 0-based/1-based 혼재 컨벤션

`web/src/features/editor/lib/hydrate-chapters.ts:53-58` 주석: 생성 시엔 1-based, 재정렬 시엔(`api/src/domains/manuscript/service/manuscript_service.py:163-169`가 `enumerate` 기반으로 0-based 재부여) 0-based로 섞여 그대로 쓰면 "0화"가 나온다고 명시. 현재 프론트(`works.store.ts:367-368`의 `reorderChapters`, `hydrate-chapters.ts:56-58`)는 항상 로컬에서 1-based로 재계산해 우회하고 있어 **현재는 버그 없음** — 다만 새 코드가 백엔드 `orderIndex`를 검증 없이 그대로 표시용으로 쓰면 바로 재현된다.
**급함**: 낮음(현재 무증상, 규약을 모르는 다음 작업자에게 함정).

### 17. 엔티티 이미지 생성은 결정적 mock — 사용자에게는 고지됨

`web/src/features/world-bible/components/entity-form.tsx:64-70`은 실제 이미지 생성 대신 data-uri SVG 플레이스홀더를 만들고 토스트로 "이미지를 생성했습니다 (목업)"이라 명시적으로 알린다. 위 항목들과 달리 **숨겨진 문제가 아니다** — 실 생성 API 연결이 남은 작업이라는 것만 기록해 둔다.
**급함**: 낮음.
