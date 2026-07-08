"""메모리 인덱서 — 엔티티 카드/씬 본문 텍스트를 임베딩해 저장 (plan.md S3).

청킹은 비목표라 전체 ``content``를 ``chunk_index=0`` 하나로 upsert한다(data-model.md
6장). 로컬 임베딩 클라이언트(``embedding_client.embed_text``)는 API 키·비용 없이
동기·즉시 반환되므로 별도 비동기 큐 없이 호출 지점에서 바로 처리한다(plan.md 비목표
— 정교한 재임베딩 최적화는 M3까지 불필요).

M4-S1(임베딩 캐싱): ``Embedding.content``가 이미 마지막으로 임베딩한 내용을 그대로
저장하고 있어 별도 해시 컬럼 없이 직접 문자열 비교로 변경 여부를 판정한다 — 내용이
같으면 비용이 드는 ``embed_text`` 호출 자체를 건너뛴다.
"""

from __future__ import annotations

import uuid

from domains.memory.embedding_client import embed_text
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.memory.repository import MemoryRepository


class MemoryService:
    def __init__(self, repo: MemoryRepository) -> None:
        self._repo = repo

    async def index_source(
        self,
        work_id: uuid.UUID,
        source_type: EmbeddingSourceType,
        source_id: uuid.UUID,
        content: str,
    ) -> Embedding:
        existing = await self._repo.get(work_id, source_type, source_id, 0)
        if existing is not None and existing.content == content:
            return existing  # eco: 내용 불변 — embed_text() 스킵(비용이 드는 부분)
        vector = embed_text(content)
        return await self._repo.upsert(work_id, source_type, source_id, 0, vector, content)
