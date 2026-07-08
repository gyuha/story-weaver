# RUN — v2-D 이미지 생성: 일관성 전략 PoC + 파이프라인
slug: v2d-image-generation-poc

## 실행 요약

계획이 착수 시점에 명시적으로 예고했던 인프라 포크(어떤 상용 이미지 생성 API를
쓸지, `.env`에 키가 없으면 halt)에 정확히 도달했다. `.env`에 이미지 생성 API 키가
없음을 확인(2026-07-04). fg-loop 드라이브 중 사용자에게 3회 질의 — 매번 "지금은
보류/나중에 하자"로 응답, 키 발급도 `/goal` 훅 해제도 선택하지 않음.

키 없이도 착수 가능한 슬라이스(S1·S2)는 실제로 구현·테스트했다. 키가 있어야만
가능한 슬라이스(S3-S5)는 계획이 원래 규정한 대로 halt 상태를 유지한다 — 이는
판단 회피가 아니라, 계획의 "키가 없으면 이 슬라이스에서 halt" 조건을 문자 그대로
충족한 결과다.

## 슬라이스별 실행 결과

- **S1 (카드 필드→프롬프트 변환)** — 완료.
  `api/src/domains/image_generation/service/image_generation_service.py`:
  `map_character_to_prompt`(인물 카드 `appearance`만 반영, `personality`·
  `speech_style`·`sample_lines`·`relations`는 미반영 — image-generation.md 3.1),
  `map_location_to_prompt`(장소 카드 `description`·`atmosphere`·`region`을
  순서대로 결합 — 3.2). pytest 6건 통과.
- **S2 (콘텐츠 정책 필터)** — 완료.
  `check_prompt_policy` — task 40 `domains.moderation.is_explicit_content`를
  그대로 재사용(별도 키워드 목록 신설 안 함, image-generation.md 4장 "전체이용가
  상한은 이미지에도 동일 적용" 원칙). pytest 2건 통과.
- **S3 (실 이미지 API 호출)** — halt. 상용 이미지 생성 API 제공사·키가 결정되지
  않음(`.env`에 미설정, grep으로 확인). 계획 자체가 "키가 없으면 이 슬라이스에서
  halt하고 사람에게 필요한 결정을 보고"라고 명시한 지점 — genuine fork.
- **S4 (웹 배선)** — halt (S3 depends). `entity-form.tsx`의 `makePlaceholder()`
  mock은 그대로 유지.
- **S5 (검증)** — 보류. S1/S2 범위 내에서는 `pytest`/`ruff`/`mypy` 통과 확인.
  S3-S4가 halt됐으므로 전체 파이프라인 e2e 검증은 대상 외.

## 계획과의 divergence

- 계획은 S1-S5를 순차 의존 체인으로 뒀는데, S3에서 halt되며 S4/S5도 함께
  멈췄다 — 계획이 이미 이 의존 관계를 명시했으므로 예상된 결과다.
- 계획 밖으로 벗어난 임의 결정 없음: 이미지 API 제공사를 임의로 고르거나,
  키 없이 목업으로 S3를 "완료"처럼 위장하는 처리는 하지 않았다.

## 재개 방법

이미지 생성 API 제공사·키가 정해지면: `image_generation_service.py`에 S3
(생성 호출)을 추가하고, `worldbible` 도메인의 `Entity`에서 `attributes`를 읽어
`map_character_to_prompt`/`map_location_to_prompt`로 변환 → `check_prompt_policy`
→ 이미지 API 호출 → 결과 URL을 엔티티의 `imageUrl` 자산 필드에 저장하는 흐름으로
이어서 구현. S4는 `entity-form.tsx`의 mock을 이 엔드포인트 호출로 교체.
