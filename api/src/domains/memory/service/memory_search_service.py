"""메모리 검색 오케스트레이션 (plan.md S4).

1차(scene_entity_links로 링크된 엔티티 + 각 엔티티의 현재 시점까지 타임라인 상태)는
worldbible/timeline 도메인의 기존 서비스 메서드를 그대로 재사용해 구한다(timeline
도메인의 ``list_timeline_states(..., up_to_chapter_id=...)``가 이미 manuscript의
``list_chapter_ids_up_to``를 통해 시점 필터를 구현해 두었다 — 재구현하지 않음).
보조(벡터 ANN)는 화 본문을 임베딩해 ``MemoryRepository.search_similar``로 조회하고,
1차에서 이미 나온 엔티티는 제외한다(병합 중복제거, 링크 우선).

이 클래스는 ``worldbible``/``manuscript``/``timeline`` 서비스에 의존한다 — 그런데
그 세 서비스는 인덱싱을 위해 (이 파일이 아닌) ``memory_service.py``의
``MemoryService``에 의존한다. 순환 임포트를 피하려고 이 클래스는 일부러
``domains/memory/service/__init__.py``의 와일드카드 재노출에 포함시키지 않았다 —
호출 측(라우터)은 이 서브모듈을 직접 임포트한다.
"""

from __future__ import annotations

import uuid

from domains.manuscript.service import ManuscriptService
from domains.memory.embedding_client import aembed_text
from domains.memory.models import EmbeddingSourceType
from domains.memory.repository import MemoryRepository
from domains.memory.schemas import MemoryItemResponse, MemoryItemType
from domains.timeline.service import TimelineService
from domains.worldbible.service import WorldBibleService

_VECTOR_TOP_K = 5


class MemorySearchService:
    def __init__(
        self,
        repo: MemoryRepository,
        worldbible_service: WorldBibleService,
        manuscript_service: ManuscriptService,
        timeline_service: TimelineService,
    ) -> None:
        self._repo = repo
        self._worldbible_service = worldbible_service
        self._manuscript_service = manuscript_service
        self._timeline_service = timeline_service

    async def search(
        self, work_id: uuid.UUID, user_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> list[MemoryItemResponse]:
        chapter = await self._manuscript_service.get_chapter_by_id(work_id, user_id, chapter_id)
        links = await self._timeline_service.list_links(work_id, user_id, chapter_id)

        items: list[MemoryItemResponse] = []
        linked_entity_ids: set[uuid.UUID] = set()
        for link in links:
            entity = await self._worldbible_service.get_entity(work_id, user_id, link.entity_id)
            linked_entity_ids.add(entity.id)
            items.append(
                MemoryItemResponse(
                    type=MemoryItemType.entity,
                    priority=1,
                    entity_id=entity.id,
                    name=entity.name,
                    summary=entity.summary,
                )
            )
            states = await self._timeline_service.list_timeline_states(
                work_id, user_id, entity.id, up_to_chapter_id=chapter_id
            )
            for state in states:
                items.append(
                    MemoryItemResponse(
                        type=MemoryItemType.timeline_state,
                        priority=2,
                        entity_id=entity.id,
                        state_key=state.state_key,
                        state_value=state.state_value,
                        note=state.note,
                    )
                )

        query_vector = await aembed_text(chapter.body)
        matches = await self._repo.search_similar(
            work_id,
            query_vector,
            limit=_VECTOR_TOP_K,
            exclude_entity_ids=linked_entity_ids,
            exclude_chapter_id=chapter_id,
        )
        for match in matches:
            items.append(
                MemoryItemResponse(
                    type=MemoryItemType.vector_match,
                    priority=3,
                    entity_id=match.source_id
                    if match.source_type == EmbeddingSourceType.entity
                    else None,
                    source_type=match.source_type,
                    source_id=match.source_id,
                    content=match.content,
                )
            )
        return items
