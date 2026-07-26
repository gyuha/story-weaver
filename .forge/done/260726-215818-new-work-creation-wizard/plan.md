<!-- forge-slug: new-work-creation-wizard -->
<!-- task: 58 -->
<!-- tdd: on -->
# 새 작품 만들기: 장르 데이터 기반 3-스텝 위저드 페이지로 개편

## Goal / Non-goals
- Goal: `/works/new`의 모달을 **독립 풀페이지 3-스텝 위저드**(장르+키워드 / 문체 / 제목)로 바꾸고, 장르별 세부 키워드·기본 문체를 **JSON 데이터**로 분리해 출력한다. 장르는 검색 셀렉트(닫힌 세트), 키워드는 장르별 프리셋 칩 + 자유 태그 입력, 문체는 장르별 예시·기본값.
- Non-goals: 백엔드 변경 없음(genre/style은 이미 문자열 수용) · 장르/키워드 편집 관리 UI 없음 · 런타임 fetch 없음(정적 import) · i18n 없음 · `subGenre` 로직 손대지 않음(서버 처리 유지).

## Source of truth
- Glossary terms: 작품(Work) in .forge/CONTEXT.md (장르·키워드·문체는 데이터일 뿐 도메인 용어 아님)
- Related ADRs: none
- 결정 요약(그릴링 합의):
  - 장르 = 닫힌 검색 세트(자유 입력 X). 자유 입력은 키워드에만. 확장 목록 ~17개: 무협·로맨스 판타지·정통 판타지·현대 판타지·SF·미스터리·판타지·로맨스·현대물·게임/헌터물·아포칼립스·대체역사·라이트노벨·학원/아카데미·스포츠·공포/스릴러·드라마.
  - JSON 단일 출처: 장르 목록 = JSON 키. `Genre = keyof typeof presets`로 파생. `Work.genre`는 shared `types.ts`에서 `string`으로 완화. `WritingStyle`(간결체·만연체·서정체) 3종 유지.
  - 문체(A안): 3종 고정, **예시 문장만 장르별**로 교체 + **장르별 기본 선택 문체**.
  - 장르 전환 시 프리셋 키워드 선택 **초기화**, 다중 선택 유지. 자유 태그는 **유지**.
  - 자유 태그: Enter/쉼표 커밋, 칩 × 및 빈 입력 Backspace로 삭제, trim 후 (프리셋 포함) 대소문자 무시 중복 제거. 최종 `keywords[]` = 프리셋 선택 + 자유 태그 병합·중복제거.
  - 초안 데이터(키워드·문체 예시)는 이번 작업에서 작성.
  - 로딩: 정적 `import`(resolveJsonModule). zod로 로드 시 1회 검증.
  - 페이지: 배경 대시보드·딤 오버레이 제거, 중앙 위저드, 상단 스텝 인디케이터(완료 스텝 클릭 이동), 우상단 ×/취소 → `/works`. 하단 이전/다음, 마지막 "작품 시작".
  - `new-work-modal.tsx` → `new-work-screen.tsx`(`NewWorkScreen`) 리네임, 라우트/테스트 import 갱신.
- Definition of Done: `/works/new`가 오버레이 없는 3-스텝 위저드로 렌더되고, 장르 선택에 따라 키워드·문체 예시가 JSON 데이터에서 바뀌며, 자유 태그가 동작하고, 제출 payload가 프리셋+자유 태그를 병합해 작품이 생성된다. `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과.

## Work slices  (tdd: 각 슬라이스는 실패 테스트 → 구현 → 통과)
- [ ] S1. 장르 프리셋 데이터 + 검증 + 타입 — `features/works/lib/genre-presets.json`(위 ~17개 장르 초안: emoji·keywords[]·defaultStyle·styleSamples{간결체,만연체,서정체}), `features/works/schema/genre-presets.schema.ts`(zod 스키마로 import한 JSON 1회 parse → 타입드 `GENRE_PRESETS`·`GENRES`·`Genre=keyof`), shared `types.ts`의 `Work.genre`→`string`. — completion criterion: zod 스키마가 실제 JSON을 통과시키고 형태가 깨진 항목은 reject하는 유닛 테스트 통과 + `pnpm typecheck` green.
- [ ] S2. 검색 장르 셀렉트 — 기존 `components/ui/popover.tsx` + `command.tsx`(cmdk)로 콤보박스. 트리거·항목에 이모지+장르명, 검색 필터. — completion criterion: 테스트 — 검색어 입력 시 목록 필터, 항목 선택 시 값 세팅·표시. (신규 의존성 없음)
- [ ] S3. 자유 키워드 태그 입력 — 단어 단위 태깅(Enter/쉼표 커밋, × 및 빈 입력 Backspace 삭제, trim+중복제거). — completion criterion: 테스트 — Enter·쉼표로 추가, 중복 무시, ×/Backspace 삭제. (depends: none)
- [ ] S4. 모달→3-스텝 위저드 페이지 + 데이터 배선 + 리네임 — `new-work-screen.tsx`(`NewWorkScreen`): Step1 장르(S2)+장르 프리셋 키워드 칩+자유 태그(S3), Step2 문체(장르 styleSamples·defaultStyle), Step3 제목. 장르 전환 시 프리셋 키워드 초기화(자유 태그 유지). Next/Back 게이팅(장르 없으면 다음 불가, 제목 없으면 시작 불가), ×→/works. 제출 시 keywords 병합·중복제거해 genre/style(문자열) 전송. 라우트 `routes/works/new.tsx`에서 `DashboardScreen`·오버레이 제거. 파일 리네임 + import 갱신, 기존 `new-work-modal.test.tsx`를 위저드에 맞게 갱신. — completion criterion: 테스트 — ① 장르 전환 시 프리셋 키워드 초기화·자유 태그 유지, ② 스텝 게이팅, ③ 제출 payload가 프리셋+자유 태그 병합·중복제거, ④ 페이지에 오버레이/대시보드 배경 없음. `pnpm typecheck`·`pnpm lint`·`pnpm test` 전체 green. (depends: S1, S2, S3)
