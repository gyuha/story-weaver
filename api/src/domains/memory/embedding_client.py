"""로컬 임베딩 클라이언트 (data-model.md 6장, plan.md S2).

``paraphrase-multilingual-MiniLM-L12-v2``(384차원)를 ``sentence-transformers``로
로컬 실행한다. 임베딩 엔드포인트를 제공하지 않는 LLM 프로바이더(``LLM_PROVIDER``)도
있으므로, 프로바이더 구성과 무관하게 동작하도록 chat 도메인과 분리된 별도 로컬
클라이언트로 둔다 — 프로바이더가 무엇이든 API 키가 필요 없다.

모델은 프로세스당 1회만 로드한다. ``lru_cache``는 캐시 미스 시 사용자 함수 호출을
락 밖에서 실행해 동시 호출(부팅 워밍업 태스크 + 첫 요청)이 겹치면 생성자가 중복 호출될
수 있어, 더블체크 락킹으로 직접 캐싱한다(plan.md S2).
"""

from __future__ import annotations

import asyncio
import threading

from sentence_transformers import SentenceTransformer

EMBEDDING_DIM = 384

_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

_model: SentenceTransformer | None = None
_model_lock = threading.Lock()


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:  # 락 대기 중 다른 스레드가 이미 로드했을 수 있음
                _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed_text(text: str) -> list[float]:
    """텍스트 1건을 384차원 벡터로 변환."""
    return _get_model().encode(text, convert_to_numpy=True).tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """텍스트 여러 건을 배치로 384차원 벡터 목록으로 변환."""
    return _get_model().encode(texts, convert_to_numpy=True).tolist()


async def aembed_text(text: str) -> list[float]:
    """``embed_text``를 별도 스레드에서 실행 — 이벤트 루프를 점유하지 않는다."""
    return await asyncio.to_thread(embed_text, text)
