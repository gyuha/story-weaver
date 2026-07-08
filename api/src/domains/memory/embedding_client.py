"""로컬 임베딩 클라이언트 (data-model.md 6장, plan.md S2).

``paraphrase-multilingual-MiniLM-L12-v2``(384차원)를 ``sentence-transformers``로
로컬 실행한다. z.ai(LLM_PROVIDER)는 임베딩 엔드포인트를 지원하지 않음이 확인되어
chat 도메인의 LLM 프로바이더와는 무관한 별도 로컬 클라이언트다 — API 키 불필요.

모델은 프로세스당 1회만 로드(``lru_cache``)한다.
"""

from __future__ import annotations

from functools import lru_cache

from sentence_transformers import SentenceTransformer

EMBEDDING_DIM = 384

_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    return SentenceTransformer(_MODEL_NAME)


def embed_text(text: str) -> list[float]:
    """텍스트 1건을 384차원 벡터로 변환."""
    return _get_model().encode(text, convert_to_numpy=True).tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """텍스트 여러 건을 배치로 384차원 벡터 목록으로 변환."""
    return _get_model().encode(texts, convert_to_numpy=True).tolist()
