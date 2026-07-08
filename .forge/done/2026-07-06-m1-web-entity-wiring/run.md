# RUN — M1: 웹 — 엔티티 카드(World Bible) + 씬-엔티티 링크 실 API 연동

slug: m1-web-entity-wiring · task: 33 · executed: 2026-07-06 (fg-loop 드라이브)

## 실행 방식

Dynamic Workflow 2단계(eco: sonnet 상한 + ECO 규율 주입, `web-feature-builder` 위임): Facade(S1) → Wire 3-way 병렬(S2 엔티티 카드·S3 씬-엔티티 링크·S4 타임라인 검토, 셋 다 S1 의존 + `works.store.ts`를 동시 편집).

## 계획대로 된 것

- **S1**: `world-bible.api.ts` facade + `attributes-mapping.ts`(라벨↔attributes 키 매핑표, 인물/장소/사건/아이템 4종).
- **S2**: 엔티티 카드 CRUD 하이드레이션+생성/수정 실 연동. emoji/imageUrl/hanja 등 백엔드에 없는 필드는 로컬 보존(`setWorkEntities` 병합).
- **S3**: 씬-엔티티 링크 add/remove 실 연동(배치 엔드포인트 없어 `Promise.all`로 개별 호출, 실패 시 스토어 미반영).
- **S4**: 타임라인 검토 화면이 실 API(엔티티별 상태 집계)로 렌더, `timeline-screen.tsx` 자체는 무변경(스토어가 실 데이터로 채워지므로).

## 계획 대비 차이 (divergences)

1. **S2가 S1의 매핑 버그를 발견·수정** — 사건.참여자/발생시점, 아이템.소유자가 백엔드에서 `UUID` 타입인데 웹 폼은 자유 텍스트라 전송 시 항상 422가 났을 것. S2가 이 3개 키를 매핑에서 제외(값은 UI에 남지만 저장 안 됨, `eco:` 표시) — 엔티티/씬 피커 UI가 생기기 전까지 임시 조치. **후속 작업 후보로 기록.**
2. **S2·S3·S4가 `works.store.ts`를 3-way 동시 편집** — task 31·32와 같은 패턴이 이번엔 3개로 늘어남. 매번 재조회(re-read) 후 편집하는 방식으로 서로 클로버 없이 병합됨(각 에이전트가 명시적으로 "재조회 후 편집" 언급). 진단 도구가 병합 중간 상태(예: `setWorkEntities` 아직 없음, 모듈 못 찾음)를 일시적으로 잡아냈으나 최종 상태는 `pnpm typecheck`/`lint`/`test` 전부 클린 — 직접 재실행으로 확인.
3. **씬-엔티티 링크는 씬 로드 시 하이드레이션 안 됨** — `hydrate-chapters.ts`의 `linkedEntityIds`가 여전히 하드코딩 빈 배열이라, 이번에 추가한 링크가 새로고침 후 사라짐(연결 자체는 API에 저장되지만 조회 안 함). 계획엔 add/remove만 명시돼 있었음 — 후속 작업 후보.
4. **타임라인 화면의 `reviewSummary.states`/`Conflict`는 여전히 mock** — 계획의 명시적 비목표(v2-B), 통계 수치가 실제와 안 맞을 수 있음을 인지하고 그대로 둠.

## 검증 (UAT)

- web: `pnpm typecheck`(clean) · `pnpm lint`(169 files, 0 errors) · `pnpm test`(22 files / 92 tests pass) — 동시편집 후 재실행으로 확인.
- 에이전트 실 브라우저 검증(playwriter 미가용 환경에선 `browse` 스킬로 대체): 회원가입→인증→로그인 후 실 백엔드에 엔티티 생성이 실제 저장/조회됨, 타임라인 화면이 실 데이터(`이서하`, `power_level=천뢰검 1식`, `status=dead`)로 정확히 렌더됨(스크린샷 확보).
- DoD 충족: World Bible에서 엔티티 카드 생성·수정이 서버에 저장·유지, 씬 링크 연결/해제 실 API 반영, 타임라인 검토 화면이 서버 데이터 표시.

## M1 전체 완료

task 28(M0 잔여)~33으로 M1(계층+엔티티+타임라인/링크, 백엔드+웹)이 전부 완성됨. C0·C1 통과, C2 재확인 필요(다음 단계).
