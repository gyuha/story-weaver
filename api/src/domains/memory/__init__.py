"""memory 도메인 — 임베딩(Embedding) 저장 및 메모리 검색 (data-model.md 6장).

엔티티 카드·씬 본문을 벡터로 임베딩해 ``embeddings`` 테이블에 저장한다(폴리모픽,
source_type/source_id + work_id 격리). worldbible(entities)·manuscript(scenes) 양쪽을
참조하지만 어느 쪽 FK도 걸지 않는다 — source_type에 따라 가리키는 테이블이 달라
단일 FK로 표현할 수 없고, 정리는 work_id FK(CASCADE)만으로 충분하다.
"""
