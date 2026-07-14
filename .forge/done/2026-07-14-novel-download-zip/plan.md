<!-- forge-slug: novel-download-zip -->
<!-- task: 54 -->
<!-- tdd: on -->
# 소설 zip 다운로드 — 부=폴더 / 회차=txt

## Goal / Non-goals

- Goal: 작품 전체 원고를 zip으로 내려받는 기능. 백엔드가 부(episode)=폴더 / 회차(chapter)=txt(그 회차 씬 `body`들을 순서대로 이어붙임) 구조의 zip을 메모리에 만들어 응답하고, 프런트는 시놉시스 화면의 "소설 다운로드(.zip)" 버튼으로 인증 blob 다운로드를 트리거한다.
- Non-goals:
  - 부분 선택 다운로드(특정 부·회차만) — 이번엔 작품 전체만.
  - PDF·EPUB 등 다른 포맷 — txt만.
  - 서명된 일회용 다운로드 URL — 인증 blob 다운로드로 충분(기존 Bearer 파이프라인 재사용).
  - 새 의존성 — 백엔드 `zipfile`(stdlib), 프런트 `fetch`(기존 패턴). JSZip 등 추가 안 함.

## Source of truth

- Glossary terms: 부 (Part=episode), 화/회차 (Chapter), 씬 (Scene, `body` 보유) — `.forge/CONTEXT.md` / `docs/data-model.md` §2
- Related ADRs: `.forge/adr/0005-users-as-tenant-app-layer-scoping.md`(소유권 404), `.forge/adr/0007-frontend-session-token-handling.md`(Bearer 토큰 — blob 다운로드가 이 파이프라인을 탐)
- Definition of Done: 시놉시스 화면의 다운로드 버튼 클릭 시 `{작품제목}.zip`이 저장되고, 압축을 풀면 `{부제목 또는 제N부}/{회차번호}화_{회차제목}.txt` 구조로 각 회차 본문이 들어 있다. 부·회차가 하나도 없는 작품은 400. 교차 테넌트 작품은 404. `task lint`·`task test`(api) + `pnpm typecheck`·`lint`·`test`(web) 전체 통과.

## Work slices

- [ ] S1. **백엔드 내보내기 엔드포인트**: manuscript 도메인에 `GET /works/{work_id}/export` 추가(`manuscript_router.py`, 소유권 확인은 기존 `get_synopsis` 등과 동일 패턴 — 미소유 404). 서비스/헬퍼가 `list_episodes` → 각 부의 `list_chapters` → 각 회차의 `list_scenes`(order_index 순)로 읽어 파이썬 `zipfile`(stdlib)로 인메모리 zip 조립:
  - 부 폴더명 = 부 `title`(비면 `제N부`, N은 order 순), 회차 파일명 = `{회차번호}화_{회차제목}.txt`(회차번호는 부 내 순번 또는 chapter order_index 기반).
  - txt 내용: 회차 제목 헤더 한 줄 + 빈 줄 + 씬 `body`들을 씬 사이 빈 줄 하나로 이어붙임. UTF-8(BOM 없음). 씬 없는 회차도 헤더만 있는 파일 생성.
  - 파일시스템 금지문자(`/ \ : * ? " < > |` 및 제어문자)는 `_`로 치환하는 헬퍼.
  - 부·회차가 하나도 없으면 400("내보낼 원고가 없습니다").
  - 응답은 `application/zip` + `Content-Disposition: attachment`(파일명 fallback; 실제 파일명은 프런트가 지정). budget/rate-limit/moderation 게이트는 붙이지 않는다(LLM 비호출, 데이터 읽기 전용).
  — 완료 기준(TDD): 실패 테스트 선작성 후 구현 — zip 안 구조(부 폴더/회차 txt 경로·개수) 확인 / txt에 씬 본문이 순서대로 들어감 / 파일명 금지문자 치환 / 씬 없는 회차도 파일 존재 / 완전 빈 작품 400 / 교차 테넌트 404.

- [ ] S2. **프런트 다운로드 버튼** (depends: S1): `pnpm generate`로 SDK 재생성(엔드포인트 타입 반영). 바이너리 zip이라 생성 axios SDK로 다루기보다, `assist.api.ts`의 fetch+Bearer 토큰 패턴을 미러링한 작은 다운로드 헬퍼를 `features/works/api/`에 추가 — `Authorization` 헤더 실어 호출, 401이면 기존 refresh 재시도(동일 정책), `res.blob()` → `URL.createObjectURL` + 숨은 `<a download="{작품제목}.zip">` 클릭 → `revokeObjectURL`. `synopsis-editor.tsx`(또는 시놉시스 라우트)의 통계 카드 근처에 "소설 다운로드(.zip)" 버튼 추가 — 진행 중 비활성화, 실패 시 `toast.error`(빈 작품 400 메시지 표면화). — 완료 기준(TDD): 실패 테스트 선작성 후 구현 — 버튼 클릭 시 export 호출 + 다운로드 트리거(createObjectURL/anchor click mock) / 실패 시 토스트 / 진행 중 비활성화.

- [ ] S3. **검증** (depends: S2): `cd api && task lint && task test`, `cd web && pnpm typecheck && pnpm lint && pnpm test` 전체 통과 + UAT(실 브라우저에서 다운로드 → 압축 해제 → 부 폴더/회차 txt 구조·본문 확인, 빈 작품 400 안내 확인). — 완료 기준: DoD 충족.
