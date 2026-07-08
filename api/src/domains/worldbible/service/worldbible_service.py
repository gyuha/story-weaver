"""World Bible 엔티티 카드 비즈니스 로직.

작품 소유권 확인은 works 도메인이 확립한 소유권 헬퍼(``WorksService.get_work``)를
재사용한다(ADR-0005). works의 ``Work`` 모델은 import하지 않고 ID만 주고받는다(도메인
간 직접 모델 import 금지). ``attributes``는 ``entity_type``에 따라
``validate_entity_attributes``로 검증하고, 실패 시 pydantic ``ValidationError``를
``AppError``(422)로 감싼다. ``entity_type``은 생성 후 불변이다 — ``EntityUpdate``
스키마 자체에 필드가 없어 PATCH 페이로드에 담겨도 반영되지 않는다. 생성/수정 시
엔티티 카드(summary+attributes)를 ``MemoryService``로 임베딩해 메모리 검색의
근거 데이터를 갱신한다(plan.md S3 — 정교한 재임베딩 최적화는 비목표라 동기 처리로
충분).
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import status
from pydantic import ValidationError as PydanticValidationError

from core.exceptions import AppError, NotFoundError
from domains.memory.models import EmbeddingSourceType
from domains.memory.service import MemoryService
from domains.works.service import WorksService
from domains.worldbible.models import Entity, EntityType
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.schemas import EntityCreate, EntityUpdate, validate_entity_attributes


def _validate_attributes(entity_type: EntityType, attributes: dict[str, Any]) -> dict[str, Any]:
    try:
        return validate_entity_attributes(entity_type, attributes)
    except PydanticValidationError as exc:
        raise AppError(str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY) from exc


def _entity_content(entity: Entity) -> str:
    """엔티티 카드 임베딩용 텍스트 (plan.md 목표: "엔티티 카드(summary+attributes)")."""
    attrs = (
        json.dumps(entity.attributes, ensure_ascii=False, sort_keys=True)
        if entity.attributes
        else ""
    )
    return "\n".join(part for part in (entity.summary, attrs) if part)


class WorldBibleService:
    def __init__(
        self, repo: WorldBibleRepository, works_service: WorksService, memory_service: MemoryService
    ) -> None:
        self._repo = repo
        self._works_service = works_service
        self._memory_service = memory_service

    async def list_entities(self, work_id: uuid.UUID, user_id: uuid.UUID) -> list[Entity]:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        return await self._repo.list_by_work(work_id)

    async def create_entity(
        self, work_id: uuid.UUID, user_id: uuid.UUID, data: EntityCreate
    ) -> Entity:
        await self._works_service.get_work(work_id, user_id)
        attributes = _validate_attributes(data.entity_type, data.attributes)
        entity = Entity(
            work_id=work_id,
            entity_type=data.entity_type,
            name=data.name,
            aliases=list(data.aliases),
            summary=data.summary,
            attributes=attributes,
        )
        entity = await self._repo.add(entity)
        await self._memory_service.index_source(
            work_id, EmbeddingSourceType.entity, entity.id, _entity_content(entity)
        )
        return entity

    async def get_entity(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID
    ) -> Entity:
        await self._works_service.get_work(work_id, user_id)
        entity = await self._repo.get(work_id, entity_id)
        if entity is None:
            raise NotFoundError("Entity")
        return entity

    async def update_entity(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID, data: EntityUpdate
    ) -> Entity:
        entity = await self.get_entity(work_id, user_id, entity_id)
        updates = data.model_dump(exclude_unset=True)
        if "attributes" in updates:
            updates["attributes"] = _validate_attributes(entity.entity_type, updates["attributes"])
        for field, value in updates.items():
            setattr(entity, field, value)
        await self._memory_service.index_source(
            work_id, EmbeddingSourceType.entity, entity.id, _entity_content(entity)
        )
        return entity

    async def delete_entity(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID
    ) -> None:
        entity = await self.get_entity(work_id, user_id, entity_id)
        await self._repo.delete(entity)
