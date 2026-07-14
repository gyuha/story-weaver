<!-- forge-slug: novel-download-zip -->
# run — 소설 zip 다운로드 (2026-07-14)

Dynamic Workflow `wf_5a49346c-7b5`(직렬 S1→S2 → 위험 영역 리뷰 3방향 병렬 → 수정 → S4, 7 에이전트, eco: sonnet 캡 + ECO 주입, TDD on, S2만 `web-feature-builder` 에이전트). 7개 완료·오류 0.

## 계획대로 된 것

- **S1** — manuscript 도메인에 `GET /works/{work_id}/export`: 순수 zip 조립 헬퍼(`service/export_service.py` 신규, stdlib `zipfile`+`io.BytesIO`) + `ManuscriptService.export_manuscript_zip`(기존 `list_episodes/list_chapters/list_scenes` 재사용해 소유권/존재 확인 내장). 부=폴더/회차=txt(회차 title 헤더+씬 body 이어붙임, UTF-8 no BOM), 파일명 금지문자·`..` traversal 치환, 씬 없는 회차도 헤더만 파일 생성, 완전 빈 작품 400, 교차 테넌트 404, `application/zip`+attachment. 게이트 없음. TDD 테스트 6→8건.
- **S2** — `features/works/api/manuscript-export.api.ts`(`assist.api.ts` fetch+Bearer+401 단일-비행 refresh 패턴 미러링, blob→createObjectURL→`<a download="{제목}.zip">`) + `synopsis.tsx` 통계 카드 근처에 "소설 다운로드(.zip)" 버튼(진행 중 비활성화, 실패 토스트). SDK 재생성. TDD 테스트 9건(api 6 + 라우트 3).
- **리뷰→수정** — 적대적 리뷰가 **실결함 3건**을 실증(아래) → 수정 에이전트가 해결 + 회귀 테스트 2건 추가.
- **S4** — 슬라이스 코드 대조로 완료 확인, 비목표 미침범(`nonGoalViolations: []`), TDD를 stash-후-재실행으로 실증, `sealable: true`.
- **메인 세션 독립 재검증**(harness가 stale LSP 진단을 띄워 보고를 불신하고 직접 실행): web `pnpm typecheck` 0·`lint` 클린(210 files)·`test` 44 files/208 통과, api `tests/manuscript/test_export_route.py` 8 통과·변경 파일 ruff·mypy(159 files) 클린.

## 차이(divergences)

1. **리뷰가 잡은 실결함 3건(전부 zip arcname 충돌·길이)** — (a) 부/회차 title 중복 시 zip arcname이 충돌해 먼저 쓴 회차 본문이 **조용히 유실**(zipfile이 Duplicate name을 경고만 하고 나중 것만 남김) — `build_manuscript_zip`에 `used_folders` 셋 + 중복 시 episode 순번 접미로 폴더명 유일성 보장 (b) 스키마상 합법인 한글 255자 title이 파일시스템 255**바이트** 세그먼트 한도를 넘겨 압축 해제 시 파일 생성 실패 — UTF-8 바이트 기준 200바이트 truncate(멀티바이트 중간 절단 방지) 추가. 세 번째는 (a)와 동일 근본원인이라 (a) 수정으로 커버. zip-slip(경로 traversal)은 기존 `..`·구분자 치환으로 이미 방어됨을 확인(오탐).
2. **zip 조립을 서비스 메서드가 아니라 전용 순수 함수 모듈(`export_service.py`)로 분리** — 계획의 "서비스나 전용 헬퍼 모듈" 중 후자 선택(테스트 용이·DB I/O와 조립 분리).
3. **회차번호는 chapter.order_index 원값이 아니라 부 내 1부터 enumerate 순번** — 계획의 "부 내 1부터 순번"과 일치, order_index에 공백이 있어도 001·002·003 연속 보장.
4. **S2 프런트 테스트 위치** — 버튼이 `SynopsisEditor`가 아니라 라우트 파일(`synopsis.tsx`)에 들어가, 테스트를 라우트 레벨(`routes/works/$workId/__tests__/synopsis.test.tsx`) + api 레벨(`features/works/api/__tests__/`)로 분리(계획은 `features/works/components/__tests__/` 언급).
5. **harness가 워크플로우 도중 stale LSP 진단(`manuscript-export.api` 모듈 못 찾음 / `SynopsisPage` 미export)을 띄웠으나 최종 트리에선 둘 다 정상** — 파일 존재·export 확인 + 실제 typecheck/test 재실행으로 stale임을 입증.
6. **S2가 browse 스킬로 실 브라우저 UAT까지 수행**(playwriter 미탑재) — 로그인→작품 생성→빈 작품 400 토스트 확인→원고 있는 작품 200→curl로 zip 받아 압축 해제해 `제1부/001화_새 화.txt`에 헤더+씬 본문 확인. S4 검증 범위(lint/test/코드대조/비목표/TDD)엔 브라우저 UAT가 없었으나 S2가 이미 수행함.

## 후속 후보

- 없음 — S4 비목표 위반 없음, 리뷰 지적 전부 해결(회귀 테스트 포함).
