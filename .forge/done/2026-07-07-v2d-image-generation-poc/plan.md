<!-- forge-slug: v2d-image-generation-poc -->
<!-- task: 45 -->
<!-- generated-by: fg-loop -->
<!-- retro-hint: optional -->
<!-- tdd: on -->
# v2-D — 이미지 생성: 일관성 전략 PoC + 파이프라인

`image-generation.md` 전체. M1 엔티티 카드(인물·장소, task 30)에 의존. **이 작업은 착수 시점에 인프라 결정 포크를 명시적으로 포함한다 — image-generation.md 2.3이 "PoC로 확정" 전까지 저신뢰(Low confidence) 권고만 제시하며, (a) 자체 GPU 호스팅 vs (c) 상용 이미지 API는 비용 구조가 근본적으로 다른 결정이다.**

## 목표 / 비목표

- 목표: 인물·장소 카드 필드→프롬프트 변환(3장 매핑표) + 콘텐츠 정책 필터(전체이용가) + 생성 이미지를 카드에 첨부. 일관성 전략은 **(c) 상용 이미지 API 캐릭터 참조**를 1차 후보로 시도(문서의 권고, 자체 GPU 인프라를 새로 만들지 않음).
- 비목표: 전략 (a) LoRA/자체 GPU 호스팅 착수(비용 구조가 근본적으로 다름 — 실제로 필요해지면 별도 인프라 결정으로 분리). 사건·아이템 이미지, 삽화/표지(image-generation.md 1.2 비목표와 동일).

## 진실의 출처

- Glossary terms: 없음.
- Related ADRs: 이 작업 완료 후 전략 선택을 ADR로 기록할 후보(하드-투-리버스+트레이드오프 성격, `image-generation.md` 2.2 트레이드오프 표 참고).
- **인프라 포크 — fg-loop 드라이브 중 여기 도달하면 halt(wall: fork) 예상**: 상용 이미지 API(전략 c)를 실제로 어떤 제공사로 쓸지, 그 API 키를 준비할지는 사람의 결정이 필요하다. `.env`에 이미지 생성 API 키가 준비돼 있지 않으면 이 작업은 "PoC 비교 설계까지"만 진행하고 실 호출은 halt.
- Definition of Done: 인물/장소 카드에서 "설정 이미지 생성" 버튼을 누르면 실 이미지 API 결과가 카드에 첨부된다(키 준비 시). 키가 없으면 이 작업은 halt 시점까지의 설계(프롬프트 변환 매핑, 정책 필터)만 완료.

## 작업 조각

- [ ] S1. 카드 필드→프롬프트 변환 (TDD, api) — completion criterion: 인물(외모+복장→시각 슬롯, 성격/말투/관계 미반영)·장소(환경/분위기/양식→시각 슬롯) 매핑 함수. pytest.
- [ ] S2. 콘텐츠 정책 필터 (TDD, api) — completion criterion: 입력 프롬프트가 수위를 넘으면 완곡 거절(텍스트 모더레이션 task 40과 동일 원칙 재사용). pytest.
- [ ] S3. 이미지 생성 호출 — completion criterion: 상용 이미지 API 키가 `.env`에 있으면 실 호출로 생성+카드 첨부(URL 저장, 기존 `imageUrl` 필드 재사용). **키가 없으면 이 슬라이스에서 halt하고 사람에게 필요한 결정(어떤 제공사·키 발급)을 보고** — fg-loop 관점에서 이것이 genuine fork.
- [ ] S4. 웹 배선 — completion criterion: `entity-form.tsx`의 `makePlaceholder()` mock을 실 생성 호출로 교체, 생성 중 로딩 상태. (depends: S1-S3)
- [ ] S5. 검증 — completion criterion: api/web 게이트 통과(S3가 halt됐다면 이 슬라이스도 보류하고 run.md에 명시). (depends: S1-S4)
