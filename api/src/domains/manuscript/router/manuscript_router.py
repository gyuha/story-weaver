"""원고 계층 HTTP 라우터 — ``/api/v1/works/{work_id}/{synopsis,episodes,...}``.

works_router.py와 동일 패턴: ``get_current_user``로 인증하고 현재 사용자 스코프로
동작한다(교차 테넌트 접근은 404 — ADR-0005). 응답은 camelCase.
"""

from __future__ import annotations

import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_async_session
from core.exceptions import AppError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.manuscript.models import Chapter, Episode, Scene, Synopsis
from domains.manuscript.repository import ManuscriptRepository
from domains.manuscript.schemas import (
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    EpisodeCreate,
    EpisodeResponse,
    EpisodeUpdate,
    SceneCreate,
    SceneResponse,
    SceneUpdate,
    SynopsisResponse,
    SynopsisUpdate,
)
from domains.manuscript.service import ManuscriptService
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService

router = APIRouter(prefix="/works/{work_id}", tags=["manuscript"])


async def _get_service(
    session: AsyncSession = Depends(get_async_session),
) -> ManuscriptService:
    return ManuscriptService(
        ManuscriptRepository(session),
        WorksService(WorksRepository(session)),
        MemoryService(MemoryRepository(session)),
    )


def _to_response(synopsis: Synopsis) -> SynopsisResponse:
    return SynopsisResponse(id=synopsis.id, work_id=synopsis.work_id, body=synopsis.body)


def _to_episode_response(episode: Episode) -> EpisodeResponse:
    return EpisodeResponse(
        id=episode.id,
        work_id=episode.work_id,
        title=episode.title,
        order_index=episode.order_index,
    )


def _to_chapter_response(chapter: Chapter) -> ChapterResponse:
    return ChapterResponse(
        id=chapter.id,
        work_id=chapter.work_id,
        episode_id=chapter.episode_id,
        title=chapter.title,
        order_index=chapter.order_index,
    )


def _to_scene_response(scene: Scene) -> SceneResponse:
    return SceneResponse(
        id=scene.id,
        work_id=scene.work_id,
        chapter_id=scene.chapter_id,
        order_index=scene.order_index,
        global_seq=scene.global_seq,
        title=scene.title,
        body=scene.body,
        created_at=scene.created_at,
        updated_at=scene.updated_at,
    )


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/synopsis", response_model=SynopsisResponse, summary="시놉시스 조회")
async def get_synopsis(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SynopsisResponse:
    try:
        synopsis = await service.get_synopsis(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(synopsis)


@router.put("/synopsis", response_model=SynopsisResponse, summary="시놉시스 upsert")
async def upsert_synopsis(
    work_id: uuid.UUID,
    payload: SynopsisUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SynopsisResponse:
    try:
        synopsis = await service.upsert_synopsis(work_id, current_user.id, payload.body)
    except AppError as exc:
        _raise_http(exc)
    return _to_response(synopsis)


# ---------------------------------------------------------------------------
# Episodes (부)
# ---------------------------------------------------------------------------


@router.get("/episodes", response_model=list[EpisodeResponse], summary="부 목록")
async def list_episodes(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[EpisodeResponse]:
    try:
        episodes = await service.list_episodes(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_episode_response(e) for e in episodes]


@router.post(
    "/episodes",
    response_model=EpisodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="부 생성",
)
async def create_episode(
    work_id: uuid.UUID,
    payload: EpisodeCreate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.create_episode(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.patch(
    "/episodes/reorder",
    response_model=list[EpisodeResponse],
    summary="부 순서 변경",
)
async def reorder_episodes(
    work_id: uuid.UUID,
    payload: list[uuid.UUID],
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[EpisodeResponse]:
    # 이 경로를 "/episodes/{episode_id}" PATCH보다 먼저 등록해야 한다 —
    # 그러지 않으면 "reorder"가 episode_id 자리로 매칭되어 422가 난다.
    try:
        episodes = await service.reorder_episodes(work_id, current_user.id, payload)
    except AppError as exc:
        _raise_http(exc)
    return [_to_episode_response(e) for e in episodes]


@router.get("/episodes/{episode_id}", response_model=EpisodeResponse, summary="부 단건 조회")
async def get_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.get_episode(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.patch("/episodes/{episode_id}", response_model=EpisodeResponse, summary="부 수정")
async def update_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: EpisodeUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> EpisodeResponse:
    try:
        episode = await service.update_episode(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_episode_response(episode)


@router.delete("/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT, summary="부 삭제")
async def delete_episode(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> None:
    try:
        await service.delete_episode(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Chapters (챕터)
# ---------------------------------------------------------------------------


@router.get(
    "/episodes/{episode_id}/chapters", response_model=list[ChapterResponse], summary="챕터 목록"
)
async def list_chapters(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[ChapterResponse]:
    try:
        chapters = await service.list_chapters(work_id, current_user.id, episode_id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_chapter_response(c) for c in chapters]


@router.post(
    "/episodes/{episode_id}/chapters",
    response_model=ChapterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="챕터 생성",
)
async def create_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: ChapterCreate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.create_chapter(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.patch(
    "/episodes/{episode_id}/chapters/reorder",
    response_model=list[ChapterResponse],
    summary="챕터 순서 변경",
)
async def reorder_chapters(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: list[uuid.UUID],
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[ChapterResponse]:
    # "/chapters/{chapter_id}" PATCH보다 먼저 등록해야 한다(위 부 reorder와 동일 이유).
    try:
        chapters = await service.reorder_chapters(work_id, current_user.id, episode_id, payload)
    except AppError as exc:
        _raise_http(exc)
    return [_to_chapter_response(c) for c in chapters]


@router.get(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    response_model=ChapterResponse,
    summary="챕터 단건 조회",
)
async def get_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.get_chapter(work_id, current_user.id, episode_id, chapter_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.patch(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    response_model=ChapterResponse,
    summary="챕터 수정",
)
async def update_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    payload: ChapterUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> ChapterResponse:
    try:
        chapter = await service.update_chapter(
            work_id, current_user.id, episode_id, chapter_id, payload
        )
    except AppError as exc:
        _raise_http(exc)
    return _to_chapter_response(chapter)


@router.delete(
    "/episodes/{episode_id}/chapters/{chapter_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="챕터 삭제",
)
async def delete_chapter(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> None:
    try:
        await service.delete_chapter(work_id, current_user.id, episode_id, chapter_id)
    except AppError as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Scenes (씬)
# ---------------------------------------------------------------------------


@router.get(
    "/episodes/{episode_id}/chapters/{chapter_id}/scenes",
    response_model=list[SceneResponse],
    summary="씬 목록",
)
async def list_scenes(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> list[SceneResponse]:
    try:
        scenes = await service.list_scenes(work_id, current_user.id, episode_id, chapter_id)
    except AppError as exc:
        _raise_http(exc)
    return [_to_scene_response(s) for s in scenes]


@router.post(
    "/episodes/{episode_id}/chapters/{chapter_id}/scenes",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="씬 생성",
)
async def create_scene(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    payload: SceneCreate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SceneResponse:
    try:
        scene = await service.create_scene(
            work_id, current_user.id, episode_id, chapter_id, payload
        )
    except AppError as exc:
        _raise_http(exc)
    return _to_scene_response(scene)


@router.get(
    "/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="씬 단건 조회",
)
async def get_scene(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    scene_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SceneResponse:
    try:
        scene = await service.get_scene(work_id, current_user.id, episode_id, chapter_id, scene_id)
    except AppError as exc:
        _raise_http(exc)
    return _to_scene_response(scene)


@router.patch(
    "/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="씬 수정",
)
async def update_scene(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    scene_id: uuid.UUID,
    payload: SceneUpdate,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> SceneResponse:
    try:
        scene = await service.update_scene(
            work_id, current_user.id, episode_id, chapter_id, scene_id, payload
        )
    except AppError as exc:
        _raise_http(exc)
    return _to_scene_response(scene)


@router.delete(
    "/episodes/{episode_id}/chapters/{chapter_id}/scenes/{scene_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="씬 삭제",
)
async def delete_scene(
    work_id: uuid.UUID,
    episode_id: uuid.UUID,
    chapter_id: uuid.UUID,
    scene_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: ManuscriptService = Depends(_get_service),
) -> None:
    try:
        await service.delete_scene(work_id, current_user.id, episode_id, chapter_id, scene_id)
    except AppError as exc:
        _raise_http(exc)
