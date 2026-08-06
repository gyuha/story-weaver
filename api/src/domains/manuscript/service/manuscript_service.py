"""원고 계층(시놉시스·부·챕터) 비즈니스 로직.

작품 소유권 확인은 works 도메인이 확립한 소유권 헬퍼(``WorksService.get_work``)를
재사용한다(ADR-0005 — "소유권 헬퍼를 works에서 확립해 하위 도메인이 재사용"). works의
``Work`` 모델은 import하지 않고 ID만 주고받는다(도메인 간 직접 모델 import 금지). 부·
챕터는 각자 직속 부모(work_id→episode_id) 조회를 재귀적으로 거쳐 경로의 각 id가 실제로
그 부모에 속하는지까지 함께 검증한다 — 아니면 ``NotFoundError``. 챕터 본문 저장(생성/
수정) 시 ``MemoryService``로 본문을 문단 그룹핑 청크로 임베딩해 메모리 검색의 근거
데이터를 갱신한다(remove-scene ADR — 씬 단위 임베딩을 화 본문 청킹 임베딩으로 대체).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import NamedTuple

from core.exceptions import AppError, NotFoundError
from domains.manuscript.models import Chapter, ChapterVersion, Episode, Synopsis
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import (
    ChapterCreate,
    ChapterUpdate,
    EpisodeCreate,
    EpisodeUpdate,
)
from domains.manuscript.service.export_service import build_manuscript_zip
from domains.memory.service import MemoryService
from domains.works.service import WorksService

_WHITESPACE_PATTERN = re.compile(r"\s")


def _char_count(body: str) -> int:
    """공백류(스페이스·탭·개행·전각 공백 등)를 제거한 글자 수.

    web 에디터 상태바(``manuscript.tsx``의 ``editor.getText().replace(/\\s/g, '').length``)와
    같은 규칙이다 — ``char_length(body)``(공백 포함 전체 문자 수)가 아니다. plan.md #72 S3
    "확인 필요" 항목: 목록의 글자 수와 상태바 숫자가 어긋나지 않도록 서버를 에디터 규칙에
    맞췄다(Postgres regexp_replace(body, '\\s', '', 'g')로도 동일하게 실측 확인 — 전각
    공백(U+3000)까지 포함해 제거됨).
    """
    return len(_WHITESPACE_PATTERN.sub("", body))


class ChapterVersionSummary(NamedTuple):
    """버전 목록 한 항목 — 본문은 담지 않는다(plan.md #72 S3, 목록 경량화)."""

    id: uuid.UUID
    created_at: datetime
    char_count: int
    char_delta: int | None
    has_summary: bool


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
        """``episode_ids`` 순서대로 ``order_index``를 재부여하고 챕터 ``global_seq``를 재계산."""
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
        next_seq = await self._repo.next_global_seq(work_id)
        chapter = Chapter(
            work_id=work_id,
            episode_id=episode_id,
            title=data.title,
            order_index=data.order_index,
            global_seq=next_seq,
            body=data.body,
        )
        chapter = await self._repo.add_chapter(chapter)
        await self._memory_service.index_chapter(work_id, chapter.id, chapter.body)
        return chapter

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
        changes = data.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(chapter, field, value)
        # 본문이 이번 PATCH에 실렸을 때만 재색인한다. 요약·제목만 바꾸면서 본문 전체를
        # 다시 임베딩하는 것은 화면에 아무 표시 없이 비용만 나가는 낭비다 —
        # `요약` 기능은 화를 요약할 때마다 PATCH하므로 특히 잦다.
        #
        # 판정은 **키의 존재**로 한다(`"body" in changes`). 빈 문자열을 falsy로 걸러내면
        # 본문을 비운 화에 낡은 임베딩이 남아 메모리 검색이 조용히 틀린다 —
        # `ChapterUpdate(body="")`도 `{'body': ''}`로 실려 온다(실측).
        if "body" in changes:
            await self._memory_service.index_chapter(work_id, chapter.id, chapter.body)
            await self._append_version_if_changed(chapter)
        elif "summary" in changes:
            # 본문 변경 없이 요약만 왔을 때 — 새 버전을 만들지 않고 최신 버전의 요약만
            # 갱신한다(ADR 260805-214733 Consequences — "최신 버전 = 현재 화 상태의
            # 거울"을 지키는 대가로 최신 버전만 mutable하다). 최신 버전이 아직 없으면
            # (한 번도 본문을 저장한 적 없는 화) 아무것도 하지 않는다.
            latest = await self._repo.get_latest_version(chapter.id)
            if latest is not None:
                latest.summary = chapter.summary
        return chapter

    async def _append_version_if_changed(self, chapter: Chapter) -> None:
        """직전(최신) 버전과 본문이 다를 때만 새 버전을 append한다(dedup, ADR 260805-214733).

        "어떤 과거 버전과도 겹치지 않을 때"가 아니라 **직전 버전과만** 비교한다 —
        되돌리기는 과거 버전의 본문을 그대로 다시 PATCH하는 것이라(복원 전용
        엔드포인트 없음), 전체 이력과 비교하면 X→Y→X로 되돌아간 저장이 버전을 만들지
        않아 "버전 수 = 본문 저장 횟수" 불변식이 깨진다.
        """
        latest = await self._repo.get_latest_version(chapter.id)
        if latest is not None and latest.body == chapter.body:
            # dedup으로 새 버전을 안 만들어도, 같은 PATCH에 summary가 함께 왔다면
            # 최신 버전에 반영해야 한다 — 안 그러면 "최신 버전 = 현재 화 상태의 거울"
            # 불변식이 깨진다(리뷰 발견: body+summary 동시 PATCH + dedup 조합).
            latest.summary = chapter.summary
            return
        await self._repo.add_version(
            ChapterVersion(chapter_id=chapter.id, body=chapter.body, summary=chapter.summary)
        )

    async def list_versions(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        limit: int,
        offset: int,
    ) -> tuple[list[ChapterVersionSummary], int]:
        """화 버전 최신순 페이지 — (항목 목록, 전체 개수).

        ``limit + 1``개를 조회해 마지막 1건은 char_delta 계산에만 쓰고 응답에서 제외한다
        — 페이지 경계에서 delta가 전량 조회 시의 값과 어긋나지 않도록(plan.md #72 S3).
        """
        await self.get_chapter(work_id, user_id, episode_id, chapter_id)  # 소유권+존재 확인
        total = await self._repo.count_versions(chapter_id)
        fetched = await self._repo.list_versions(chapter_id, limit, offset)
        items: list[ChapterVersionSummary] = []
        for index, version in enumerate(fetched[:limit]):
            older = fetched[index + 1] if index + 1 < len(fetched) else None
            delta = None if older is None else _char_count(version.body) - _char_count(older.body)
            items.append(
                ChapterVersionSummary(
                    id=version.id,
                    created_at=version.created_at,
                    char_count=_char_count(version.body),
                    char_delta=delta,
                    has_summary=version.summary is not None,
                )
            )
        return items, total

    async def get_version(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        chapter_id: uuid.UUID,
        version_id: uuid.UUID,
    ) -> ChapterVersion:
        await self.get_chapter(work_id, user_id, episode_id, chapter_id)  # 소유권+존재 확인
        version = await self._repo.get_version(chapter_id, version_id)
        if version is None:
            raise NotFoundError("ChapterVersion")
        return version

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
        """``chapter_ids`` 순서대로 ``order_index``를 재부여하고 챕터 ``global_seq``를 재계산."""
        await self.get_episode(work_id, user_id, episode_id)  # 소유권+존재 확인 (미소유 시 404)
        existing = {c.id: c for c in await self._repo.list_chapters(episode_id)}
        if set(chapter_ids) != set(existing):
            raise NotFoundError("Chapter")
        for index, chapter_id in enumerate(chapter_ids):
            existing[chapter_id].order_index = index
        await self._recompute_global_seq(work_id)
        return [existing[chapter_id] for chapter_id in chapter_ids]

    async def _recompute_global_seq(self, work_id: uuid.UUID) -> None:
        """작품 전체를 부→챕터 문서 순서로 훑어 ``global_seq``를 1부터 재부여.

        재정렬 후 영향받는 챕터만 골라내는 대신 전체를 다시 매기는 단순한 방식(저빈도
        관리자 동작이라 성능보다 단순함을 우선— plan.md S1).
        """
        await self._repo.flush()  # order_index 변경을 내보내야 아래 재조회에 반영된다
        seq = 1
        for episode in await self._repo.list_episodes(work_id):
            for chapter in await self._repo.list_chapters(episode.id):
                chapter.global_seq = seq
                seq += 1

    async def get_chapter_by_id(
        self, work_id: uuid.UUID, user_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> Chapter:
        """계층 경로 없이 ``chapter_id``만으로 조회(다른 도메인의 ID-only 크로스 도메인 참조용)."""
        await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        chapter = await self._repo.get_chapter_by_id(work_id, chapter_id)
        if chapter is None:
            raise NotFoundError("Chapter")
        return chapter

    async def list_chapter_ids_up_to(
        self, work_id: uuid.UUID, user_id: uuid.UUID, up_to_chapter_id: uuid.UUID
    ) -> list[uuid.UUID]:
        """``up_to_chapter_id``의 ``global_seq`` 이하인 챕터 id 목록(타임라인 시점 필터의 근거)."""
        up_to_chapter = await self.get_chapter_by_id(work_id, user_id, up_to_chapter_id)
        return await self._repo.list_chapter_ids_up_to_seq(work_id, up_to_chapter.global_seq)

    # -- Export --------------------------------------------------------------

    async def export_manuscript_zip(self, work_id: uuid.UUID, user_id: uuid.UUID) -> bytes:
        """작품 전체 원고를 부=폴더/회차=txt 구조의 zip 바이트로 조립.

        소유권 확인은 ``list_episodes``/``list_chapters``에 내장(미소유 시 404). 부·회차가
        하나도 없으면 내보낼 원고가 없다는 뜻이라 400.
        """
        episodes = await self.list_episodes(work_id, user_id)
        episodes_with_content: list[tuple[Episode, list[Chapter]]] = []
        total_chapters = 0
        for episode in episodes:
            chapters = await self.list_chapters(work_id, user_id, episode.id)
            total_chapters += len(chapters)
            episodes_with_content.append((episode, chapters))

        if not episodes or total_chapters == 0:
            raise AppError("내보낼 원고가 없습니다")

        return build_manuscript_zip(episodes_with_content)
