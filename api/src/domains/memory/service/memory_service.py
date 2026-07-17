"""메모리 인덱서 — 엔티티 카드/화 본문 텍스트를 임베딩해 저장 (plan.md S2/S3).

엔티티 카드는 짧아 ``chunk_index=0`` 하나로 upsert한다(data-model.md 6장). 화 본문은
길어질 수 있어 ``index_chapter``가 문단 그룹핑(~800자)으로 여러 청크로 나눠
``chunk_index 0..N-1``로 인덱싱한다(remove-scene ADR — 씬 단위 임베딩을 화 본문
청킹 임베딩으로 대체). 로컬 임베딩 클라이언트(``embedding_client.embed_text``)는
API 키·비용 없이 동기·즉시 반환되므로 별도 비동기 큐 없이 호출 지점에서 바로
처리한다.

M4-S1(임베딩 캐싱): ``Embedding.content``가 이미 마지막으로 임베딩한 내용을 그대로
저장하고 있어 별도 해시 컬럼 없이 직접 문자열 비교로 변경 여부를 판정한다 — 청크별로
내용이 같으면 비용이 드는 ``embed_text`` 호출 자체를 건너뛴다.
"""

from __future__ import annotations

import re
import uuid

from domains.memory.embedding_client import embed_text
from domains.memory.models import Embedding, EmbeddingSourceType
from domains.memory.repository import MemoryRepository

_CHAPTER_CHUNK_MAX_CHARS = 800


def _chunk_paragraphs(body: str, max_chars: int = _CHAPTER_CHUNK_MAX_CHARS) -> list[str]:
    """문단(빈 줄 구분)을 순서대로 모아 ``max_chars``자를 넘기 전까지 한 청크로 묶는다.

    문단 하나가 이미 ``max_chars``를 넘으면 그 문단 자체를 단독 청크로 둔다(문단 내부
    분할은 비목표 — plan.md S2). 문단이 하나도 안 나오면(짧은 단문 등) 전체를 청크
    1개로 취급한다.
    """
    paragraphs = [p for p in re.split(r"\n\s*\n+", body.strip()) if p.strip()]
    if not paragraphs:
        return [body]

    chunks = [paragraphs[0]]
    for paragraph in paragraphs[1:]:
        candidate = f"{chunks[-1]}\n\n{paragraph}"
        if len(candidate) <= max_chars:
            chunks[-1] = candidate
        else:
            chunks.append(paragraph)
    return chunks


class MemoryService:
    def __init__(self, repo: MemoryRepository) -> None:
        self._repo = repo

    async def index_source(
        self,
        work_id: uuid.UUID,
        source_type: EmbeddingSourceType,
        source_id: uuid.UUID,
        content: str,
        chunk_index: int = 0,
    ) -> Embedding:
        existing = await self._repo.get(work_id, source_type, source_id, chunk_index)
        if existing is not None and existing.content == content:
            return existing  # eco: 내용 불변 — embed_text() 스킵(비용이 드는 부분)
        vector = embed_text(content)
        return await self._repo.upsert(
            work_id, source_type, source_id, chunk_index, vector, content
        )

    async def index_chapter(
        self, work_id: uuid.UUID, chapter_id: uuid.UUID, body: str
    ) -> list[Embedding]:
        """화 본문을 문단 그룹핑 청크로 나눠 ``chunk_index 0..N-1``로 인덱싱한다.

        청크별 내용 불변 스킵은 ``index_source``의 upsert 재사용으로 얻는다. 재수정으로
        청크 수가 이전보다 줄면 뒤쪽 ``chunk_index`` 행이 고아로 남으므로 지운다.
        """
        chunks = _chunk_paragraphs(body)
        rows = [
            await self.index_source(work_id, EmbeddingSourceType.chapter, chapter_id, chunk, idx)
            for idx, chunk in enumerate(chunks)
        ]
        await self._repo.delete_chunks_from(
            work_id, EmbeddingSourceType.chapter, chapter_id, len(chunks)
        )
        return rows
