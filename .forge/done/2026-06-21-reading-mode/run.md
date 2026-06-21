# RUN — 읽기 모드(챕터 단위 몰입 읽기) 추가

## 실행 방식
워크플로우(다중 서브에이전트) 대신 **직접 구현**. 프론트엔드 기능 하나로 슬라이스 3개가 같은 에디터 영역에 강하게 묶여 있어 병렬 서브에이전트는 파일 충돌만 유발 — fg-run 비용 원칙(단일 에이전트로 충분하면 워크플로우 생략)에 따른 결정.

## 계획 대비 실제 (divergence)

전반적으로 **계획과 거의 일치 (divergence 낮음)**. 슬라이스 3개 모두 계획대로 구현.

### S1. 읽기 라우트 골격 + 챕터 셀렉터 — 계획대로
- `selectors.ts`에 `findChapterNav(work, chapterId)` 추가 — 계획의 `findChapter(+이전/다음)`를 한 함수로 통합(`ChapterNav` 인터페이스 반환). 별도 `findChapter`는 불필요해 만들지 않음.
- `routes/works/$workId/read/$chapterId.tsx` + `read/index.tsx`(기본 챕터 redirect) 추가. 잘못된 chapterId → 첫 챕터로, 챕터 없으면 `write`로 폴백을 **beforeLoad redirect**로 처리(기존 `write/index.tsx` 패턴과 동일).
- `routeTree.gen.ts` 자동 재생성 확인, `to`/`params` 타입 컴파일 통과.

### S2. 몰입형 읽기 레이아웃 — 계획대로
- `reading-screen.tsx` 신규. WorkShell 미사용, 전용 풀스크린. 비어있지 않은 씬만 `flatMap`으로 이어 붙여 씬 경계 없이 연속 렌더(키는 `${sceneId}-p{i}`로 안정화). 빈 씬/문단0 건너뜀. 대사(「」) `text-ink-soft` 유지. 빈 챕터 시 "아직 작성된 내용이 없습니다".

### S3. 진입·복귀 토글 + 챕터 경계 내비 — 계획대로
- `editor-screen.tsx` 상단바에 "읽기"(BookOpen) 링크 추가 → 현재 chapter.id의 읽기 모드.
- 읽기 바의 "편집" → 그 챕터 **첫 씬**(`scenes[0].id`)의 집필 화면. (자잘한 변경) 첫 씬이 없을 경우 대비해 `disabled` 링크 대신 **조건부 렌더**(첫 씬 있으면 write/$sceneId, 없으면 write)로 정리 — 타입·UX 안정.
- 이전/다음 화 화살표(`ChapterArrow`), 챕터 끝 "다음 화"/"마지막 화입니다".

## 검증 (UAT)
- `pnpm typecheck` green, `pnpm lint` green, `pnpm build` green.
- playwriter 실측(로그인→작품→집필→읽기 왕복):
  - 집필 상단바 "읽기" → `/works/hoegwija/read/ch7` 진입.
  - 읽기 모드: 전역 TopBar 없음 / 메모리 패널 없음 / AI 도구 없음(몰입형 확인).
  - ch7 본문이 s1→s2 연속 렌더(씬 경계 안 보임), 빈 씬 ch7-s3 건너뜀.
  - "편집" → `/works/hoegwija/write/ch7-s1`(그 챕터 첫 씬), ch7 마지막 챕터라 "마지막 화입니다" 표시.
  - "이전 화" → ch6, "편집" → `/works/hoegwija/write/ch6-s1`로 복귀, 집필 화면에 읽기 버튼·AI 도구 복귀.

## 코드 리뷰
별도 적대적 코드 리뷰 워크플로우 생략. 변경이 auth·데이터 변경·공개 API·마이그레이션 등 위험 영역에 닿지 않는 프론트 mock UI이며, 동작은 playwriter UAT로 직접 확인함(ADR-0007의 위험/대규모 트리거 미해당).

## 비목표 준수
폰트/테마·진행률·퍼블리싱·모바일 정교화·백엔드 연동 모두 손대지 않음. 편집 모드는 "읽기" 버튼 추가 외 변경 없음.
