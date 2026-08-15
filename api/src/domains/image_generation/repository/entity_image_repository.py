"""설정 이미지(EntityImage) 데이터 접근 계층.

모든 조회는 ``work_id``로 스코프한다(ADR-0005, 테넌트 격리) — 남의 ``work_id``
이미지를 조회하면 ``None``(라우터/서비스가 이를 404로 변환). 커밋은 요청 단위
세션(``get_async_session``)이 수행하므로 여기서는 add/flush만 한다
(manuscript_repository.py와 동일 패턴).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.image_generation.models import EntityImage


class EntityImageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, image: EntityImage) -> EntityImage:
        self._session.add(image)
        await self._session.flush()
        return image

    async def list_for_entity(self, work_id: uuid.UUID, entity_id: uuid.UUID) -> list[EntityImage]:
        """엔티티의 설정 이미지를 append 순서(``created_at`` 오름차순)로 조회."""
        result = await self._session.execute(
            select(EntityImage)
            .where(EntityImage.work_id == work_id, EntityImage.entity_id == entity_id)
            .order_by(EntityImage.created_at)
        )
        return list(result.scalars().all())

    async def get(self, work_id: uuid.UUID, image_id: uuid.UUID) -> EntityImage | None:
        result = await self._session.execute(
            select(EntityImage).where(EntityImage.id == image_id, EntityImage.work_id == work_id)
        )
        return result.scalar_one_or_none()

    async def set_primary(
        self, work_id: uuid.UUID, entity_id: uuid.UUID, image_id: uuid.UUID
    ) -> EntityImage | None:
        """``image_id``를 대표 이미지로 세우고 기존 대표는 내린다.

        부분 유니크 인덱스(``ix_entity_images_primary``, entity당 ``is_primary`` true 1개)를
        위반하지 않으려면 기존 대표를 먼저 내리고(flush) 새 대표를 세워야 한다 — 두 UPDATE를
        같은 순서로 하지 않으면 한 순간 두 행이 true가 되어 제약을 위반한다.
        """
        target = await self.get(work_id, image_id)
        if target is None or target.entity_id != entity_id:
            return None

        current = await self._session.execute(
            select(EntityImage).where(
                EntityImage.entity_id == entity_id, EntityImage.is_primary.is_(True)
            )
        )
        for existing in current.scalars().all():
            existing.is_primary = False
        await self._session.flush()

        target.is_primary = True
        await self._session.flush()
        return target

    async def set_visual_description(self, image_id: uuid.UUID, text: str) -> None:
        image = await self._session.get(EntityImage, image_id)
        if image is None:
            return
        image.visual_description = text
        await self._session.flush()
