---
author: gyuha
decided: 2026-08-11 23:45
---
# 이미지 생성은 로컬 OpenAI 호환 게이트웨이로, 산출물은 로컬 파일시스템에 둔다

`architecture.md` 2.5는 이미지 산출물 저장에 **객체 스토리지**를 예고하고 "자리만 확보"해 뒀고, `image-generation.md` 2.3은 일관성 전략으로 **(c) 상용 이미지 API의 캐릭터 참조**를 1차 후보로 권고했다. 실제로 착수하려니 두 전제 모두 지금 이 프로젝트에 없었다 — 상용 제공사 키가 하나도 없고(OpenAI·Anthropic·Gemini·Azure 키는 전부 플레이스홀더), 객체 스토리지도 없다(docker-compose는 postgres·redis·mailpit 3개, boto3/minio 참조 0건). 그래서 **이미 있는 것 하나**로 간다: `LLM_PROVIDER=openai_compatible`이 가리키는 로컬 게이트웨이(`OPENAI_COMPATIBLE_BASE_URL`)의 `POST /v1/images/generations`를 `model=antigravity/gemini-3.1-flash-image`로 호출하고, 나온 JPEG를 **로컬 파일시스템**(`work_id` 스코프 경로)에 쓰고 DB에는 경로·메타만 남긴다. 조회는 테넌트 가드를 통과하는 백엔드 엔드포인트가 바이트를 넘긴다.

## Considered Options

- **MinIO(S3 호환) docker 서비스 추가** — `architecture.md` 2.5를 지금 진짜로 충당하고 운영과 동일 구조가 된다. 그러나 docker 서비스 + aioboto3 의존성 + 프리사인 URL 배선이 이번 작업에 전부 들어온다. 아직 운영 배포가 없는 단계에서 그 비용을 먼저 치를 이유가 없다.
- **Postgres `bytea`** — 인프라 0이고 백업이 일원화된다. 그러나 장당 ~900KB를 Postgres가 지고 나르게 되고 TOAST 페이지가 부푼다.
- **`data:` URI를 DB text에** — 웹이 지금 목업에서 쓰는 방식. base64가 33% 팽창해 최악이라 논외.
- **상용 제공사 키 발급(Gemini/OpenAI)** — 품질·기능(특히 레퍼런스 참조)은 이쪽이 낫지만, 새 키 발급·과금 계정이 사람의 결정이고 v2-D PoC(task 45)가 정확히 그 포크에서 halt했다. 이미 유효한 크레덴셜 하나로 먼저 동작하는 것을 만드는 편이 낫다.

## Consequences

- **게이트웨이의 실측 제약이 곧 제품의 제약이다** (2026-08-11 실호출로 측정):

  | 항목 | 결과 |
  |---|---|
  | `POST /v1/images/generations` (`antigravity/gemini-3.1-flash-image`) | 200, `b64_json` JPEG 1024×1024. 한국어 프롬프트·무협 장르 표현력 양호 |
  | `POST /v1/images/edits` (레퍼런스 이미지 입력) | 400 — `Image edit is not supported for built-in provider "antigravity"` |
  | `seed` 고정 | 파라미터는 받으나 **무효** — 같은 seed·같은 프롬프트 2회가 서로 다른 이미지 |
  | `n=2` | 400 — `Multiple candidates is not enabled for this model` (한 번에 1장) |
  | `size` | 화면비 힌트로만 먹음 — `1024x1536` → 848×1264, `512x512` → 1024×1024 |
  | `revised_prompt` | 입력 프롬프트를 그대로 에코(모델이 다시 쓰지 않음) |
  | 소요 시간 | 18~60초+ |
  | 기본 `gpt-image-1` 라우트 | 400 — `No credentials for image provider: vercel-ai-gateway` |
  | `antigravity/gemini-3-pro-image-preview` | 404 `NOT_FOUND`(모델 목록엔 있으나 실호출 불가) |

  레퍼런스 참조·seed·다중 후보가 모두 막혔다는 것이 캐릭터 일관성 전략을 결정했다 — ADR `260811-234512`.
- `image-generation.md` 2.3의 "1차 후보는 전략 (c)" 권고와 4장의 "출력 이미지 모더레이션"은 이 인프라에서 **적용 대상이 없다**. 문서를 읽고 전략 (c)를 전제하지 말 것.
- 실제로 호출되는 이미지 모델이 하나뿐이므로 [[품질 티어]]로 이미지 모델을 가를 수 없다. 이미지 생성은 티어 개념 밖에 있다.
- 파일시스템이므로 **배포 시 볼륨이 필요하고 여러 인스턴스가 파일을 공유하지 못한다.** 스케일아웃 시점이 곧 객체 스토리지로 옮길 시점이다. 저장·조회를 모듈 하나로 좁혀 둬서 그 이전이 그 모듈 교체로 끝나게 한다.
- 카드 삭제 시 DB 행은 FK CASCADE가 지우지만 **파일은 남는다** — 파일 정리를 서비스가 명시적으로 해야 한다.
- 생성이 최대 2분이라 요청은 SSE 단계 이벤트로 흘린다(기존 `sse_starlette` 재사용). 단순 동기 POST는 운영 리버스 프록시의 60초 기본 타임아웃에서 조용히 실패한다.
