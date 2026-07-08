"""image_generation 도메인 — 엔티티 카드→프롬프트 변환 + 콘텐츠 정책 필터.

v2-D S1/S2, image-generation.md 3·4장. S3(실 이미지 API 호출)은 상용 이미지
생성 API 제공사·키가 아직 결정되지 않아 이 도메인에 포함하지 않는다
(v2d-image-generation-poc.md 인프라 포크, fg-loop 드라이브 halt 사유). 키가
정해지면 이 도메인의 S1/S2 함수를 입력으로 삼는 생성 호출·라우터·웹 배선
(S3-S5)을 후속으로 추가한다.
"""
