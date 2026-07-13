"""원고 계층(시놉시스·부·챕터·씬) 비즈니스 로직.

작품 소유권 확인은 works 도메인이 확립한 소유권 헬퍼(``WorksService.get_work``)를
재사용한다(ADR-0005 — "소유권 헬퍼를 works에서 확립해 하위 도메인이 재사용"). works의
``Work`` 모델은 import하지 않고 ID만 주고받는다(도메인 간 직접 모델 import 금지). 부·
챕터·씬은 각자 직속 부모(work_id→episode_id→chapter_id) 조회를 재귀적으로 거쳐 경로의
각 id가 실제로 그 부모에 속하는지까지 함께 검증한다 — 아니면 ``NotFoundError``. 씬
본문 저장(생성/수정) 시 ``MemoryService``로 본문을 임베딩해 메모리 검색의 근거
데이터를 갱신한다(plan.md S3 — 정교한 재임베딩 최적화는 비목표라 동기 처리로 충분).
"""

from __future__ import annotations

import uuid

from core.exceptions import NotFoundError
from domains.manuscript.models import Chapter, Episode, Scene, Synopsis
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import (
    ChapterCreate,
    ChapterUpdate,
    EpisodeCreate,
    EpisodeUpdate,
    SceneCreate,
    SceneUpdate,
)
from domains.memory.models import EmbeddingSourceType
from domains.memory.service import MemoryService
from domains.works.service import WorksService


class ManuscriptService:
    def __init__(
        self, repo: ManuscriptRepository, works_service: WorksService, memory_service: MemoryService
    ) -> None:
        self._repo = repo
        self._works_service = works_service
        self._memory_service = memory_service

    async def get_synopsis(self, work_id: uuid.UUID, user_id: uuid.UUID) -> Synopsis:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        synopsis = await self._repo.get_synopsis_by_work(work_id)
        if synopsis is None:
            raise NotFoundError("Synopsis")
        return synopsis

    async def upsert_synopsis(self, work_id: uuid.UUID, user_id: uuid.UUID, body: str) -> Synopsis:
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        return await self._repo.upsert_synopsis(work_id, body)

    # -- Episodes --------------------------------------------------------

    async def list_episodes(self, work_id: uuid.UUID, user_id: uuid.UUID) -> list[Episode]:
        await self._works_service.get_work(work_id, user_id)
        return await self._repo.list_episodes(work_id)

    async def create_episode(
        self, work_id: uuid.UUID, user_id: uuid.UUID, data: EpisodeCreate
    ) -> Episode:
        await self._works_service.get_work(work_id, user_id)
        episode = Episode(work_id=work_id, title=data.title, order_index=data.order_index)
        return await self._repo.add_episode(episode)

    async def get_episode(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID
    ) -> Episode:
        await self._works_service.get_work(work_id, user_id)
        episode = await self._repo.get_episode(work_id, episode_id)
        if episode is None:
            raise NotFoundError("Episode")
        return episode

    async def update_episode(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID, data: EpisodeUpdate
    ) -> Episode:
        episode = await self.get_episode(work_id, user_id, episode_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(episode, field, value)
        return episode

    async def delete_episode(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID
    ) -> None:
        episode = await self.get_episode(work_id, user_id, episode_id)
        await self._repo.delete_episode(episode)

    async def reorder_episodes(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_ids: list[uuid.UUID]
    ) -> list[Episode]:
        """``episode_ids`` 순서대로 ``order_index``를 재부여하고 씬 ``global_seq``를 재계산."""
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        existing = {e.id: e for e in await self._repo.list_episodes(work_id)}
        if set(episode_ids) != set(existing):
            raise NotFoundError("Episode")
        for index, episode_id in enumerate(episode_ids):
            existing[episode_id].order_index = index
        await self._recompute_global_seq(work_id)
        return [existing[episode_id] for episode_id in episode_ids]

    # -- Chapters ---------------------------------------------------------

    async def list_chapters(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID
    ) -> list[Chapter]:
        await self.get_episode(work_id, user_id, episode_id)
        return await self._repo.list_chapters(episode_id)

    async def create_chapter(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        data: ChapterCreate,
    ) -> Chapter:
        await self.get_episode(work_id, user_id, episode_id)
        chapter = Chapter(
            work_id=work_id, episode_id=episode_id, title=data.title, order_index=data.order_index
        )
        return await self._repo.add_chapter(chapter)

    async def get_chapter(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> Chapter:
        await self.get_episode(work_id, user_id, episode_id)
        chapter = await self._repo.get_chapter(episode_id, chapter_id)
        if chapter is None:
            raise NotFoundError("Chapter")
        return chapter

    async def update_chapter(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        data: ChapterUpdate,
    ) -> Chapter:
        chapter = await self.get_chapter(work_id, user_id, episode_id, chapter_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(chapter, field, value)
        return chapter

    async def delete_chapter(
        self, work_id: uuid.UUID, user_id: uuid.UUID, episode_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> None:
        chapter = await self.get_chapter(work_id, user_id, episode_id, chapter_id)
        await self._repo.delete_chapter(chapter)

    async def reorder_chapters(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_ids: list[uuid.UUID],
    ) -> list[Chapter]:
        """``chapter_ids`` 순서대로 ``order_index``를 재부여하고 씬 ``global_seq``를 재계산."""
        await self.get_episode(work_id, user_id, episode_id)  # 소유권+존재 확인 (미소유 시 404)
        existing = {c.id: c for c in await self._repo.list_chapters(episode_id)}
        if set(chapter_ids) != set(existing):
            raise NotFoundError("Chapter")
        for index, chapter_id in enumerate(chapter_ids):
            existing[chapter_id].order_index = index
        await self._recompute_global_seq(work_id)
        return [existing[chapter_id] for chapter_id in chapter_ids]

    async def _recompute_global_seq(self, work_id: uuid.UUID) -> None:
        """작품 전체를 부→챕터→씬 문서 순서로 훑어 ``global_seq``를 1부터 재부여.

        재정렬 후 영향받는 씬만 골라내는 대신 전체를 다시 매기는 단순한 방식(저빈도
        관리자 동작이라 성능보다 단순함을 우선— plan.md S1).
        """
        await self._repo.flush()  # order_index 변경을 내보내야 아래 재조회에 반영된다
        seq = 1
        for episode in await self._repo.list_episodes(work_id):
            for chapter in await self._repo.list_chapters(episode.id):
                for scene in await self._repo.list_scenes(chapter.id):
                    scene.global_seq = seq
                    seq += 1

    # -- Scenes ------------------------------------------------------------

    async def list_scenes(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
    ) -> list[Scene]:
        await self.get_chapter(work_id, user_id, episode_id, chapter_id)
        return await self._repo.list_scenes(chapter_id)

    async def create_scene(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        data: SceneCreate,
    ) -> Scene:
        await self.get_chapter(work_id, user_id, episode_id, chapter_id)
        next_seq = await self._repo.next_global_seq(work_id)
        scene = Scene(
            work_id=work_id,
            chapter_id=chapter_id,
            order_index=data.order_index,
            global_seq=next_seq,
            title=data.title,
            body=data.body,
        )
        scene = await self._repo.add_scene(scene)
        await self._memory_service.index_source(
            work_id, EmbeddingSourceType.scene, scene.id, scene.body
        )
        return scene

    async def get_scene(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        scene_id: uuid.UUID,
    ) -> Scene:
        await self.get_chapter(work_id, user_id, episode_id, chapter_id)
        scene = await self._repo.get_scene(chapter_id, scene_id)
        if scene is None:
            raise NotFoundError("Scene")
        return scene

    async def update_scene(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        scene_id: uuid.UUID,
        data: SceneUpdate,
    ) -> Scene:
        scene = await self.get_scene(work_id, user_id, episode_id, chapter_id, scene_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(scene, field, value)
        await self._memory_service.index_source(
            work_id, EmbeddingSourceType.scene, scene.id, scene.body
        )
        return scene

    async def delete_scene(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        scene_id: uuid.UUID,
    ) -> None:
        scene = await self.get_scene(work_id, user_id, episode_id, chapter_id, scene_id)
        await self._repo.delete_scene(scene)

    async def get_scene_by_id(
        self, work_id: uuid.UUID, user_id: uuid.UUID, scene_id: uuid.UUID
    ) -> Scene:
        """계층 경로 없이 ``scene_id``만으로 조회(다른 도메인의 ID-only 크로스 도메인 참조용)."""
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        scene = await self._repo.get_scene_by_id(work_id, scene_id)
        if scene is None:
            raise NotFoundError("Scene")
        return scene

    async def list_scenes_by_chapter_id(
        self, work_id: uuid.UUID, user_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> list[Scene]:
        """계층 경로(episode_id) 없이 ``chapter_id``만으로 챕터의 전체 씬 조회.

        ``get_scene_by_id``와 동일 패턴(다른 도메인의 ID-only 크로스 도메인 참조용) —
        chat 도메인이 "현재 화(챕터) 전체 씬"을 얻을 때 쓴다(work-chat-context S2).
        """
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        return await self._repo.list_scenes(chapter_id)

    async def list_scene_ids_up_to(
        self, work_id: uuid.UUID, user_id: uuid.UUID, up_to_scene_id: uuid.UUID
    ) -> list[uuid.UUID]:
        """``up_to_scene_id``의 ``global_seq`` 이하인 씬 id 목록(타임라인 시점 필터의 근거)."""
        up_to_scene = await self.get_scene_by_id(work_id, user_id, up_to_scene_id)
        return await self._repo.list_scene_ids_up_to_seq(work_id, up_to_scene.global_seq)
