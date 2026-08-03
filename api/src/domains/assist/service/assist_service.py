"""집필 보조 서비스 — 프롬프트 조립을 위한 오케스트레이션 (plan.md M3-S3).

라우터가 받은 작업별 입력(``AssistTaskInput``)에 소유권 확인·화 존재 확인·메모리
검색(task 34)을 더해 :func:`~domains.assist.service.prompt_assembler.assemble_prompt`가
바로 쓸 수 있는 ``list[BaseMessage]``를 만든다. LLM 호출 자체(티어 선택·스트리밍)는
라우터가 S2(``tier_routing``)를 직접 써서 처리한다 — 이 서비스는 프롬프트 조립까지만
담당한다.

교정(``correct``)·제목(``title``)은 ai-pipeline.md 3.1 표상 메모리 주입이 "최소"
(고유명사만)이라, S3 지시대로 전체 메모리 검색(P1~P3, 벡터 임베딩 포함)을 아예
생략한다 — 소유권/화 존재 확인만 한다.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from domains.assist.schemas import AssistTaskInput, CharacterSpeechProfile
from domains.assist.service.prompt_assembler import assemble_prompt
from domains.assist.tier_routing import TaskType
from domains.manuscript.service import ManuscriptService
from domains.memory.schemas import MemoryItemResponse
from domains.memory.service.memory_search_service import MemorySearchService
from domains.works.service import WorksService
from domains.worldbible.service import WorldBibleService

if TYPE_CHECKING:
    from langchain_core.messages import BaseMessage


class AssistService:
    def __init__(
        self,
        works_service: WorksService,
        manuscript_service: ManuscriptService,
        worldbible_service: WorldBibleService,
        memory_search_service: MemorySearchService,
    ) -> None:
        self._works_service = works_service
        self._manuscript_service = manuscript_service
        self._worldbible_service = worldbible_service
        self._memory_search_service = memory_search_service

    async def build_messages(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        chapter_id: uuid.UUID,
        task_type: TaskType,
        task_input: AssistTaskInput,
    ) -> list[BaseMessage]:
        """소유권/화 확인 + 메모리 검색(교정 제외) + 프롬프트 조립."""
        work = await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        # 화 존재 확인
        await self._manuscript_service.get_chapter_by_id(work_id, user_id, chapter_id)

        memory_items: list[MemoryItemResponse]
        if task_type in (TaskType.correct, TaskType.title_, TaskType.summary):
            # eco: 교정·제목·요약은 최소 주입(고유명사만) — 전체 검색(P1~P3) 자체를
            # 생략한다. 요약의 근거는 전달된 본문이므로 메모리가 필요 없다.
            memory_items = []
        else:
            memory_items = await self._memory_search_service.search(work_id, user_id, chapter_id)

        return assemble_prompt(
            task_type,
            work_genre=work.genre,
            work_style=work.style,
            memory_items=memory_items,
            task_input=task_input,
        )

    async def resolve_character_profile(
        self, work_id: uuid.UUID, user_id: uuid.UUID, entity_id: uuid.UUID
    ) -> CharacterSpeechProfile:
        """지문/대사 변환용 대상 인물의 말투 프로필(``speech_style``/``sample_lines``) 조회."""
        entity = await self._worldbible_service.get_entity(work_id, user_id, entity_id)
        return CharacterSpeechProfile(
            name=entity.name,
            speech_style=entity.attributes.get("speech_style", ""),
            sample_lines=list(entity.attributes.get("sample_lines", [])),
        )
