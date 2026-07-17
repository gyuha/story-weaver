"""설정 충돌 자동 감지 비즈니스 로직 (data-model.md 8장, S1 규칙을 S2 쿼리에 적용).

작품 소유권 확인은 works 도메인의 ``WorksService.get_work``를 재사용한다(ADR-0005,
미소유 시 404). 엔티티 목록은 worldbible, 엔티티별 타임라인 상태는 timeline, 화의
``global_seq``는 manuscript — 이미 확립된 서비스 메서드만 호출해 조회한다(직접 SQL
join 없이 ID 기반 크로스 도메인 서비스 호출로 구성). 다른 도메인의 ORM 모델은 import
하지 않는다 — 조회 즉시 이 도메인 소유의 ``_State``로 옮겨담아 이후 로직은 그 값만
다룬다(assist_service.py가 ``work.genre``/``entity.name``만 꺼내 쓰는 것과 동일하게
반환값의 필드만 읽고 타입 자체는 import하지 않는 패턴). 엔티티마다 예약 state_key별로
타임라인 상태를 global_seq 순으로 정렬한 뒤, 인접한 두 상태에 ``rules.is_contradiction``
을 적용해 충돌 쌍을 뽑는다 — 이 저장소 규모에는 성능 요구가 없어(plan.md) 화당 1회
조회(N+1)로 충분하다(eco).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from itertools import pairwise
from typing import NamedTuple

from domains.conflicts.rules import RESERVED_STATE_KEYS, is_contradiction
from domains.conflicts.schemas import ConflictResponse, ConflictStateRef
from domains.manuscript.service import ManuscriptService
from domains.timeline.service import TimelineService
from domains.works.service import WorksService
from domains.worldbible.service import WorldBibleService


class _State(NamedTuple):
    """타임라인 상태 1행의 충돌 판정에 필요한 값만 옮겨담은 로컬 표현."""

    id: uuid.UUID
    chapter_id: uuid.UUID
    global_seq: int
    state_value: str
    created_at: datetime


class ConflictsService:
    def __init__(
        self,
        works_service: WorksService,
        worldbible_service: WorldBibleService,
        timeline_service: TimelineService,
        manuscript_service: ManuscriptService,
    ) -> None:
        self._works_service = works_service
        self._worldbible_service = worldbible_service
        self._timeline_service = timeline_service
        self._manuscript_service = manuscript_service

    async def list_conflicts(
        self, work_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[ConflictResponse]:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)

        conflicts: list[ConflictResponse] = []
        for entity in await self._worldbible_service.list_entities(work_id, user_id):
            states_by_key = await self._reserved_states_by_key(work_id, user_id, entity.id)
            for state_key, ordered in states_by_key.items():
                for earlier, later in pairwise(ordered):
                    if is_contradiction(state_key, earlier.state_value, later.state_value):
                        conflicts.append(
                            ConflictResponse(
                                entity_id=entity.id,
                                entity_name=entity.name,
                                state_key=state_key,
                                earlier=ConflictStateRef(**earlier._asdict()),
                                later=ConflictStateRef(**later._asdict()),
                            )
                        )
        return conflicts

    async def _reserved_states_by_key(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID
    ) -> dict[str, list[_State]]:
        """엔티티의 예약 state_key 타임라인 상태를 key별로 global_seq 오름차순 정렬해 반환."""
        by_key: dict[str, list[_State]] = {}
        for state in await self._timeline_service.list_timeline_states(work_id, user_id, entity_id):
            if state.state_key not in RESERVED_STATE_KEYS:
                continue  # 예약 키가 아니면 충돌 판정 대상에서 제외
            chapter = await self._manuscript_service.get_chapter_by_id(
                work_id, user_id, state.chapter_id
            )
            by_key.setdefault(state.state_key, []).append(
                _State(
                    id=state.id,
                    chapter_id=state.chapter_id,
                    global_seq=chapter.global_seq,
                    state_value=state.state_value,
                    created_at=state.created_at,
                )
            )
        for states in by_key.values():
            states.sort(key=lambda s: s.global_seq)
        return by_key
