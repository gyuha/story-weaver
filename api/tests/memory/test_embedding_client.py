"""embedding_client 결정성/차원 테스트 (TDD, 실 로컬 모델 — mock 없음).

첫 실행은 모델 다운로드(~100MB)로 느릴 수 있음 — 이후 로컬 캐시됨.
"""

from __future__ import annotations

from domains.memory.embedding_client import EMBEDDING_DIM, embed_text, embed_texts


def test_embed_text_is_deterministic() -> None:
    text = "김무사는 주인공의 스승이다."
    assert embed_text(text) == embed_text(text)


def test_embed_text_differs_for_different_input() -> None:
    assert embed_text("김무사는 주인공의 스승이다.") != embed_text("오늘은 비가 온다.")


def test_embed_text_output_length_is_always_384() -> None:
    assert len(embed_text("짧은 텍스트")) == EMBEDDING_DIM
    assert len(embed_text("")) == EMBEDDING_DIM


def test_embed_texts_batch_matches_single_calls() -> None:
    texts = ["첫 번째 문장", "두 번째 문장"]
    batch = embed_texts(texts)
    assert len(batch) == 2
    assert all(len(vec) == EMBEDDING_DIM for vec in batch)
    assert batch[0] == embed_text(texts[0])
    assert batch[1] == embed_text(texts[1])
