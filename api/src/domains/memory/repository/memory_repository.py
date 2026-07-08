"""메모리(임베딩) 데이터 접근 계층.

폴리모픽 키(work_id + source_type + source_id + chunk_index)로 임베딩 1건을 조회·
upsert한다. 커밋은 요청 단위 세션(``get_async_session``)이 성공 시 수행하므로
여기서는 flush를 호출하지 않는다 — worldbible/manuscript의 update_entity/
update_scene은 같은 세션에서 이미 setattr로 엔티티/씬을 변경해둔 상태로 이 조회를
호출하는데, 여기서 autoflush(또는 명시적 flush)가 일어나면 그 UPDATE가 먼저
플러시되어 onupdate 컬럼(``updated_at``)이 만료되고, 이후 라우터가 그 값을 동기
속성 접근으로 읽을 때 ``MissingGreenlet``이 난다(비동기 세션 밖에서의 지연 로딩 시도).
``no_autoflush``로 조회 시점의 자동 플러시를 막아 그 UPDATE를 요청 단위 커밋
시점까지 지연시킨다.
"""

from __future__ import annotations

import uuid
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.memory.models import Embedding, EmbeddingSourceType


class MemoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self,
        work_id: uuid.UUID,
        source_type: EmbeddingSourceType,
        source_id: uuid.UUID,
        chunk_index: int,
    ) -> Embedding | None:
        with self._session.no_autoflush:
            result = await self._session.execute(
                select(Embedding).where(
                    Embedding.work_id == work_id,
                    Embedding.source_type == source_type,
                    Embedding.source_id == source_id,
                    Embedding.chunk_index == chunk_index,
                )
            )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        work_id: uuid.UUID,
        source_type: EmbeddingSourceType,
        source_id: uuid.UUID,
        chunk_index: int,
        embedding: list[float],
        content: str,
    ) -> Embedding:
        """청크 키가 일치하는 기존 행을 갱신하거나, 없으면 새로 추가한다(중복 방지)."""
        row = await self.get(work_id, source_type, source_id, chunk_index)
        if row is None:
            row = Embedding(
                work_id=work_id,
                source_type=source_type,
                source_id=source_id,
                chunk_index=chunk_index,
                embedding=embedding,
                content=content,
            )
            self._session.add(row)
        else:
            row.embedding = embedding
            row.content = content
        return row

    async def search_similar(
        self,
        work_id: uuid.UUID,
        query_embedding: list[float],
        *,
        limit: int,
        exclude_entity_ids: Collection[uuid.UUID] = (),
        exclude_scene_id: uuid.UUID | None = None,
    ) -> list[Embedding]:
        """``work_id`` 선필터 코사인 거리 ANN top-``limit``(data-model.md 6장 보조 검색).

        1차(링크)로 이미 반환된 엔티티(``exclude_entity_ids``)는 결과에서 뺀다(병합
        중복제거, 링크 우선 — plan.md S4). ``exclude_scene_id``로 현재 씬 자신의
        임베딩도 뺀다: 씬 본문을 그대로 자기 자신에게 매칭시키는 자명한 결과라
        보조 검색의 취지(관련 설정 보충)에 맞지 않다(eco — 별도 요청은 없었지만
        자기 자신 매칭은 무의미해 제외).
        """
        stmt = select(Embedding).where(Embedding.work_id == work_id)
        if exclude_entity_ids:
            stmt = stmt.where(
                ~(
                    (Embedding.source_type == EmbeddingSourceType.entity)
                    & (Embedding.source_id.in_(exclude_entity_ids))
                )
            )
        if exclude_scene_id is not None:
            stmt = stmt.where(
                ~(
                    (Embedding.source_type == EmbeddingSourceType.scene)
                    & (Embedding.source_id == exclude_scene_id)
                )
            )
        stmt = stmt.order_by(Embedding.embedding.cosine_distance(query_embedding)).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
