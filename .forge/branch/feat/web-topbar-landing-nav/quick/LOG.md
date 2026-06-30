
## 2026-06-21 — 프로필에 "내 서재로 가기" 추가 + 타이틀→홈
- 요청: 프로필 메뉴에 "내 서재로 가기" 추가, 타이틀 클릭 시 홈으로 이동
- 결정: 타이틀=홈(`/`, LandingScreen), 내 서재=`/works`(작품 목록) — 둘을 분리(프로필 메뉴와 타이틀이 서로 다른 곳을 가리키게)
- 결과: done

## 2026-06-23 — 새 화/새 부 추가에 확인 다이얼로그
- 요청: 작업트리에서 부·화 추가 시 실수 방지용 확인 다이얼로그를 띄워 즉시 추가 막기
- 결정: 기존 `useModal`/`openModal`(src/stores/modal-store) alert 모달 재사용 — 확인 시 추가, 취소 시 닫기 (부·화 둘 다)
- 결과: done (work-tree.tsx에 confirmAddChapter/confirmAddPart 추가, 버튼 onClick 교체. typecheck·lint 통과 + playwriter로 취소=미추가·확인=추가 검증)

## 2026-06-23 — 작업트리에서 씬 노드 제거, 회차 클릭 = 첫 씬 편집
- 요청: 트리의 "새 씬"(씬 노드)이 불필요 — 회차(화)를 누르면 바로 해당 씬 편집으로
- 결정: 씬 레벨/펼치기 제거, 회차 행을 첫 씬 write로 가는 Link로. 다중 씬 이동은 에디터 내부에서 (사용자 선택)
- 결과: done (work-tree.tsx에서 SceneRow·openChapters 제거, 회차=Link(첫 씬)·활성 강조·더블클릭 제목편집 유지. typecheck·lint 통과 + playwriter로 7화(다중 씬) 클릭→첫 씬 편집 이동 확인)

## 2026-06-23 — 새 화 번호를 부별 독립 증가로
- 요청: 화 번호가 작품 전역으로 늘어남 → 각 부마다 따로 증가하게
- 결정: addChapter의 nextIndex를 같은 partLabel 내 max+1로 변경
- 결과: done (works.store.ts addChapter index를 부별 max+1로. typecheck·lint 통과 + playwriter로 제1부 새 화=2화 확인)

## 2026-06-25 — 사이드바 기능/콘텐츠 시각 분리
- 요청: 기능 메뉴와 부/화 콘텐츠 목록이 안 갈림 → 분리감 + 콘텐츠 집중 UI
- 결정: 구분선 + 섹션 라벨(A안). 기능 메뉴 상단 블록 → border-t 구분선 → 콘텐츠 섹션 라벨(작품명) → 부/화 트리. 작품명 라벨을 기능 위가 아닌 콘텐츠 헤더로 이동
- 결과: done (work-shell.tsx만 변경. typecheck·lint 통과 + playwriter로 기능/콘텐츠 분리·작품명 콘텐츠 헤더 육안 확인)

## 2026-06-25 — 설정 참고(링크) 제거 기능
- 요청: "설정 참고"에 링크된 참고 설정을 지우는 방법 제공
- 결정: linked 카드에 hover X 버튼 → removeSceneEntityLink 즉시 제거 + 토스트(추가 팝업으로 쉽게 복구 가능해 확인 다이얼로그 없음). 벡터 보조 카드는 자동이라 제외
- 결과: done (works.store removeSceneEntityLink + memory-panel linked 카드 hover X. typecheck·lint 통과 + playwriter로 천류운 제거·토스트 확인)

## 2026-06-26 — 새 엔티티 이모지를 emoji-picker-react 팝업으로
- 요청: 이모지 필드를 클릭하면 선택 메뉴(팝업)가 떠서 고르기, emoji-picker-react 사용
- 결정: emoji-picker-react 의존성 추가(사용자 명시 요청). 이모지 input을 현재 이모지 표시 버튼 → 클릭 시 EmojiPicker 팝업, onEmojiClick으로 setEmoji+닫기
- 결과: done (emoji-picker-react@4.19.1 설치 + new-entity-screen.tsx 이모지 필드 교체. typecheck·lint 통과 + playwriter로 팝업·검색·선택→버튼 반영·닫힘 확인)

## 2026-06-30 — web→api 프록시 포트 + 이중 /api 수정
- 요청: signup이 `http://localhost:3000/api/api/v1/auth/signup`로 가 오류(curl 제보)
- 진단: ① 백엔드는 :8000(가동 중·api 기본 포트)인데 vite 프록시 target이 :8080(죽음) → 500 ECONNREFUSED(실제 에러). ② 이중 /api는 baseURL `/api` + SDK 경로가 이미 `/api/v1` 포함이라 합쳐진 것 — rewrite가 앞 `/api`를 떼어 우연히 보정하던 fragile 구조
- 결정: vite proxy target `:8080`→`:8000` + `rewrite` 제거, `api-client.ts` baseURL 기본값 `'/api'`→`''`(dev 상대경로). 브라우저 URL이 깨끗한 `/api/v1/...`가 되고 프록시가 :8000으로 그대로 전달(prod는 VITE_API_BASE_URL). CLAUDE.md 백엔드 연동 문구도 갱신
- 결과: done (vite.config.ts·api-client.ts·CLAUDE.md. typecheck·lint 통과 + curl `:3000/api/v1/auth/signup`→:8000 백엔드 422 검증, 이중 /api 제거). 참고: 사용자 비밀번호 `nightz13@$`는 대문자가 없어 백엔드 검증 422(대문자 1자 이상 필요) — 별도 입력 이슈

## 2026-06-30 — 가입 실패 사유를 UI에 표시
- 요청: 가입 오류 메시지가 화면에 전혀 안 떠 network 탭을 보고 파악함 — 왜 실패했는지 보이게
- 진단: signup-page의 `catch`가 에러를 버리고 하드코딩 일반 문구만 표시. 백엔드 FastAPI 응답(422 `detail` 검증 배열 / 문자열 `detail`)을 미추출
- 결정: `apiErrorMessage(err, fallback)` 헬퍼로 detail이 문자열이면 그대로, 422 배열이면 각 `ctx.error ?? msg`를 추출해 표시(추출 실패 시 일반 문구). signup에만 적용(login은 보안상 일반 문구 유지)
- 결과: done (signup-page.tsx + 테스트 1개 추가. vitest 3/3·typecheck·lint 통과 + playwriter로 대문자 없는 비번 제출→'Password must contain at least one uppercase letter.' 화면 표시 확인)

## 2026-06-30 — 로그인 실패 시 화면 리로드 → 에러 안 보임 수정
- 요청: 로그인 실패하면 화면이 바로 갱신(리로드)돼 왜 실패했는지 못 봄 — 확인 정도는 가능하게 (/playwriter)
- 진단(playwriter 재현): 잘못된 자격증명 → 백엔드 401 → 응답 인터셉터가 "토큰 만료"로 오인해 refresh 시도 → refresh 토큰 없음 → `window.location.href='/auth/login'` 전체 리로드 → 로그인 페이지가 set한 에러가 소실(reloaded:true, 에러 안 보임). login-page는 preventDefault 있어 네이티브 제출 아님 — 원인은 인터셉터
- 결정: 인터셉터에 공개 auth 경로(login/signup/password-reset/verify-email) 예외(`isPublicAuthError`) 추가 → 해당 4xx는 refresh/리다이렉트 없이 그대로 전파(refresh 엔드포인트는 자체 처리 유지). 로그인 페이지 catch는 401=자격증명 일반 문구, 그 외(이메일 미인증 등)=백엔드 사유 표시. `apiErrorMessage`를 `features/auth/lib/api-error.ts`로 추출해 login·signup 공유
- 결과: done (api-interceptors.ts·login-page.tsx·signup-page.tsx·features/auth/lib/api-error.ts[신규] + 테스트 4개[interceptor 2, login 2]. vitest 22/22·typecheck·lint 통과 + playwriter로 reloaded:false·'이메일 또는 비밀번호를 확인해주세요.' 표시 재확인)

## 2026-06-30 — 로그인 실패 사유 구분(이메일 미인증 vs 잘못된 자격증명)
- 요청: 이메일 미인증(`{"detail":"Email verification is required before login."}`)인데도 '이메일 또는 비밀번호를 확인' 일반 문구만 떠 사용자가 사유를 못 알아챔 — 구분 가능하게
- 진단: 백엔드가 잘못된 자격증명("Invalid email or password.")과 미인증("Email verification is required before login.")을 **둘 다 401**로 반환(`api/.../auth_service.py:244,248`, 모두 UnauthorizedError). 직전 수정이 401을 전부 자격증명 문구로 덮어써 미인증 사유를 가림
- 결정: 상태코드 대신 **detail로 분기**. login-page에 `LOGIN_ERROR_MESSAGES` 매핑 추가(두 알려진 401 사유 → 친절한 한국어: 자격증명/이메일 인증 필요), 매핑에 없는 detail은 `apiErrorMessage`가 백엔드 문구를 그대로 노출
- 결과: done (login-page.tsx + login 테스트 3개로 갱신[자격증명·미인증·미매핑 fallback]. vitest 6/6·typecheck·lint 통과 + 백엔드에 미인증 유저 생성→playwriter 로그인→'이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해 주세요.' 표시·리로드 없음 확인)
