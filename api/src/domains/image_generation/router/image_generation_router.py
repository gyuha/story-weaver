"""화풍 카탈로그·작품 화풍·설정 이미지 조회·생성 HTTP 라우터.

``/art-styles``(카탈로그·견본 썸네일)는 테넌트 데이터가 아닌 정적 자산이라 인증 없이
공개한다(옛 ``/image-templates``의 후신 — 화풍이 작품 단위로 올라가며 대체됐다, ADR
`260813-110724`). ``/works/{work_id}/art-style``·``/works/{work_id}/images/{image_id}``는
works 도메인이 확립한 소유권 헬퍼(``WorksService.get_work``)로 테넌트 가드를 건다
(worldbible_router.py와 동일 패턴, ADR-0005) — 남의 ``work_id``로 요청하면 404.

``/works/{work_id}/entities/{entity_id}/images``(POST, SSE)는 실제 생성 경로다
(plan.md S5). 단계 이벤트(프롬프트 조립 → 이미지 생성 → 묘사 → 완료)는
``assist_router.py``와 같은 어휘(``EventSourceResponse`` + ``[DONE]`` sentinel)를
쓴다. **결정적인 순서(ADR 260811-234512)**: 이미지가 나오면 즉시 파일 저장 + DB
커밋 + 이미지 이벤트 발행을 하고, 그 다음에 비전 묘사를 뽑아 UPDATE한다 — 그래서
묘사 단계에서 취소·오류가 나도 이미지 행과 파일은 이미 커밋되어 남는다.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any, Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from core.database import get_async_session
from core.exceptions import AppError, ConflictError
from domains.auth.models import User
from domains.auth.security import get_current_user
from domains.image_generation.models import EntityImage
from domains.image_generation.repository import EntityImageRepository
from domains.image_generation.schemas import EntityTypeLiteral
from domains.image_generation.service import (
    build_entity_image_prompt,
    image_gateway,
    image_storage,
    vision_describe,
)
from domains.image_generation.service.template_catalog import (
    get_art_style,
    list_art_styles,
    list_compositions,
    sample_path,
)
from domains.memory.repository import MemoryRepository
from domains.memory.service import MemoryService
from domains.works.repository import WorksRepository
from domains.works.service import WorksService
from domains.worldbible.repository import WorldBibleRepository
from domains.worldbible.service import WorldBibleService

art_styles_router = APIRouter(prefix="/art-styles", tags=["image-generation"])
works_art_style_router = APIRouter(prefix="/works/{work_id}/art-style", tags=["image-generation"])
images_router = APIRouter(prefix="/works/{work_id}/images", tags=["image-generation"])
generate_router = APIRouter(
    prefix="/works/{work_id}/entities/{entity_id}/images", tags=["image-generation"]
)


class _CamelModel(BaseModel):
    """camelCase 입력 (assist_router.py와 동일 패턴)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ArtStyleResponse(_CamelModel):
    """``GET /art-styles`` 응답 항목. ``samples``는 카드 유형별 견본 URL(화풍 선택 화면용)."""

    id: str
    label: str
    samples: dict[EntityTypeLiteral, str]


class ArtStyleUpdateRequest(_CamelModel):
    """``PUT /works/{work_id}/art-style`` 요청 바디. ``art_style_note``는 빈 문자열도 허용한다."""

    art_style_id: str
    art_style_note: str | None = None

    @field_validator("art_style_id")
    @classmethod
    def _known_style(cls, value: str) -> str:
        if get_art_style(value) is None:
            raise ValueError(f"알 수 없는 화풍 id: {value!r}")
        return value


class WorkArtStyleResponse(_CamelModel):
    """``GET``/``PUT /works/{work_id}/art-style`` 응답. 화풍 미지정 작품은 두 필드 모두 ``null``."""

    art_style_id: str | None
    art_style_note: str | None


class GenerateEntityImageRequest(_CamelModel):
    """``templateId``를 받지 않는다 — 작품의 화풍을 읽어 조립한다(S5, ADR `260813-110724`).

    옛 웹이 여전히 ``templateId``를 보내더라도(2/2 배포 전까지) ``_CamelModel``의 기본
    ``extra="ignore"``가 조용히 걸러낸다 — 거부하면 2/2가 들어오기 전까지 로그가
    시끄러워지므로 무시를 택했다(plan.md S5 확인 필요 항목).
    """

    extra_prompt: str = ""


class EntityImageResponse(BaseModel):
    """설정 이미지 한 항목. ``image_url``은 바이트 조회 엔드포인트의 경로를 담는다 —
    ``ArtStyleResponse.samples``가 쓰는 것과 같은 방식이다.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: uuid.UUID
    image_url: str
    is_primary: bool
    visual_description: str | None
    template_id: str
    created_at: datetime


class UpdateEntityImageRequest(_CamelModel):
    """부분 갱신 — 보낸 필드만 반영한다(``exclude_unset``, worldbible·manuscript와 동일 방식).

    ``is_primary``는 ``True``만 받는다: 대표는 **다른 장을 올리는 것으로만** 바뀐다. 내리기만
    허용하면 "이미지가 있는데 대표가 없는 카드"가 생겨 카드가 얼굴을 잃는다 — 이미지가
    1장 이상인 카드는 대표가 정확히 1장이라는 불변식을 여기서 지킨다.
    """

    is_primary: Literal[True] | None = None
    visual_description: str | None = None


def _to_response(image: EntityImage) -> EntityImageResponse:
    return EntityImageResponse(
        id=image.id,
        image_url=f"/api/v1/works/{image.work_id}/images/{image.id}",
        is_primary=image.is_primary,
        visual_description=image.visual_description,
        template_id=image.template_id,
        created_at=image.created_at,
    )


async def _get_works_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorksService:
    return WorksService(WorksRepository(session))


async def _get_image_repo(
    session: AsyncSession = Depends(get_async_session),
) -> EntityImageRepository:
    return EntityImageRepository(session)


async def _get_worldbible_service(
    session: AsyncSession = Depends(get_async_session),
) -> WorldBibleService:
    works_service = WorksService(WorksRepository(session))
    memory_service = MemoryService(MemoryRepository(session))
    return WorldBibleService(WorldBibleRepository(session), works_service, memory_service)


def _raise_http(exc: AppError) -> NoReturn:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


async def _stream_entity_image_generation(
    *,
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    entity_type: EntityTypeLiteral,
    attributes: dict[str, Any],
    art_style_id: str,
    work_tone: str,
    extra_prompt: str,
    existing_visual_description: str | None,
    is_first_image: bool,
    image_repo: EntityImageRepository,
    session: AsyncSession,
) -> AsyncIterator[dict[str, str]]:
    """4단계(프롬프트 조립 → 이미지 생성 → 묘사 → 완료) SSE 이벤트를 순서대로 흘린다.

    이미지 생성이 끝나면 **즉시 커밋**한다(ADR 260811-234512) — 그 뒤 묘사 단계에서
    취소(``asyncio.CancelledError``, ``Exception``이 아니라 그대로 전파돼 여기서
    잡히지 않는다)나 오류가 나도 이미지 행·파일은 이미 커밋되어 남는다.
    """
    yield {"event": "stage", "data": "prompt"}
    prompt = build_entity_image_prompt(
        art_style_id,
        work_tone,
        entity_type,
        attributes,
        visual_description=existing_visual_description,
        extra_prompt=extra_prompt,
    )

    yield {"event": "stage", "data": "image"}
    try:
        image_bytes = await image_gateway.generate_image(prompt)
    except Exception as exc:
        yield {"event": "error", "data": str(exc)}
        return

    image_id = uuid.uuid4()
    image_storage.save_image(work_id, entity_id, image_id, image_bytes)
    image = EntityImage(
        id=image_id,
        work_id=work_id,
        entity_id=entity_id,
        file_path=f"{work_id}/{entity_id}/{image_id}.jpg",
        # 옛 ``template.id``와 같은 ``<style>-<type>`` 형식을 유지한다 — 화풍이 훗날
        # 바뀌어도 이 이미지가 실제로 어떤 화풍으로 생성됐는지가 보존된다(ADR
        # `260813-110724`의 "과거는 이미 안전하다").
        template_id=f"{art_style_id}-{entity_type}",
        extra_prompt=extra_prompt,
        final_prompt=prompt,
        is_primary=is_first_image,
    )
    await image_repo.add(image)
    await session.commit()
    yield {
        "event": "image",
        "data": json.dumps({"imageId": str(image_id), "isPrimary": image.is_primary}),
    }

    yield {"event": "stage", "data": "description"}
    try:
        description = await vision_describe.describe_image(image_bytes)
    except Exception as exc:
        yield {"event": "error", "data": str(exc)}
        return

    await image_repo.set_visual_description(image_id, description)
    await session.commit()
    yield {
        "event": "description",
        "data": json.dumps({"imageId": str(image_id), "visualDescription": description}),
    }
    yield {"data": "[DONE]"}


@art_styles_router.get("", response_model=list[ArtStyleResponse], summary="작품 화풍 카탈로그")
async def list_art_styles_endpoint() -> list[ArtStyleResponse]:
    entity_types = [c.entity_type for c in list_compositions()]
    return [
        ArtStyleResponse(
            id=style.id,
            label=style.label,
            samples={
                entity_type: f"/api/v1/art-styles/{style.id}/samples/{entity_type}"
                for entity_type in entity_types
            },
        )
        for style in list_art_styles()
    ]


@art_styles_router.get("/{style_id}/samples/{entity_type}", summary="화풍 견본 썸네일")
async def get_art_style_sample(style_id: str, entity_type: EntityTypeLiteral) -> FileResponse:
    if get_art_style(style_id) is None:
        raise HTTPException(status_code=404, detail="Art style not found")
    path = sample_path(style_id, entity_type)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Sample not yet generated")
    return FileResponse(path, media_type="image/jpeg")


@works_art_style_router.get("", response_model=WorkArtStyleResponse, summary="작품 화풍 조회")
async def get_work_art_style(
    work_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
) -> WorkArtStyleResponse:
    """화풍이 아직 없는 작품은 두 필드 모두 ``null``(200) — "미지정"을 404와 구분한다."""
    try:
        work = await works_service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)
    return WorkArtStyleResponse(art_style_id=work.art_style_id, art_style_note=work.art_style_note)


@works_art_style_router.put("", response_model=WorkArtStyleResponse, summary="작품 화풍 저장")
async def update_work_art_style(
    work_id: uuid.UUID,
    payload: ArtStyleUpdateRequest,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
) -> WorkArtStyleResponse:
    """언제든 다시 저장할 수 있다 — [[작품 화풍]]은 잠기지 않는다(ADR 260813-110724)."""
    try:
        work = await works_service.update_art_style(
            work_id, current_user.id, payload.art_style_id, payload.art_style_note
        )
    except AppError as exc:
        _raise_http(exc)
    return WorkArtStyleResponse(art_style_id=work.art_style_id, art_style_note=work.art_style_note)


@images_router.get("/{image_id}", summary="설정 이미지 바이트 조회")
async def get_entity_image(
    work_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    image_repo: EntityImageRepository = Depends(_get_image_repo),
) -> Response:
    try:
        await works_service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)

    image = await image_repo.get(work_id, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        data = image_storage.read_image(work_id, image.entity_id, image_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image file not found") from exc

    return Response(content=data, media_type="image/jpeg")


@generate_router.get("", response_model=list[EntityImageResponse], summary="설정 이미지 목록")
async def list_entity_images(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    image_repo: EntityImageRepository = Depends(_get_image_repo),
) -> list[EntityImageResponse]:
    """카드의 설정 이미지를 append 순서로 돌려준다. 이미지가 없으면 빈 배열(404 아님)."""
    try:
        await works_service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)

    images = await image_repo.list_for_entity(work_id, entity_id)
    return [_to_response(image) for image in images]


@images_router.patch(
    "/{image_id}", response_model=EntityImageResponse, summary="대표 지정 · 시각 묘사 수정"
)
async def update_entity_image(
    work_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: UpdateEntityImageRequest,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    image_repo: EntityImageRepository = Depends(_get_image_repo),
    session: AsyncSession = Depends(get_async_session),
) -> EntityImageResponse:
    """보낸 필드만 반영한다. 남의 ``work_id``·없는 이미지는 404.

    ``set_visual_description``은 없는 이미지에 조용히 반환하므로, 여기서 ``get``으로 먼저
    확인한다 — 그 조회가 ``work_id`` 스코프라 테넌트 가드를 겸한다(ADR-0005).
    """
    try:
        await works_service.get_work(work_id, current_user.id)
    except AppError as exc:
        _raise_http(exc)

    image = await image_repo.get(work_id, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    updates = payload.model_dump(exclude_unset=True)

    if updates.get("is_primary"):
        promoted = await image_repo.set_primary(work_id, image.entity_id, image_id)
        if promoted is None:
            raise HTTPException(status_code=404, detail="Image not found")
        image = promoted

    if "visual_description" in updates:
        await image_repo.set_visual_description(image_id, updates["visual_description"])

    await session.commit()
    await session.refresh(image)
    return _to_response(image)


@generate_router.post("", summary="설정 이미지 생성 (SSE)")
async def generate_entity_image(
    work_id: uuid.UUID,
    entity_id: uuid.UUID,
    payload: GenerateEntityImageRequest,
    current_user: User = Depends(get_current_user),
    works_service: WorksService = Depends(_get_works_service),
    worldbible_service: WorldBibleService = Depends(_get_worldbible_service),
    image_repo: EntityImageRepository = Depends(_get_image_repo),
    session: AsyncSession = Depends(get_async_session),
) -> EventSourceResponse:
    try:
        work = await works_service.get_work(work_id, current_user.id)
        entity = await worldbible_service.get_entity(work_id, current_user.id, entity_id)
    except AppError as exc:
        _raise_http(exc)

    art_style_id = work.art_style_id
    if art_style_id is None:
        # 존재 확인(404)보다 뒤에 둔다 — 남의 work_id·없는 entity_id는 여전히 404다.
        _raise_http(
            ConflictError("작품의 화풍이 정해지지 않았습니다. 먼저 이미지 스타일을 정해 주세요.")
        )

    existing = await image_repo.list_for_entity(work_id, entity_id)
    primary = next((img for img in existing if img.is_primary), None)

    return EventSourceResponse(
        _stream_entity_image_generation(
            work_id=work_id,
            entity_id=entity_id,
            entity_type=entity.entity_type.value,
            attributes=entity.attributes,
            art_style_id=art_style_id,
            work_tone=work.art_style_note or "",
            extra_prompt=payload.extra_prompt,
            existing_visual_description=primary.visual_description if primary else None,
            is_first_image=not existing,
            image_repo=image_repo,
            session=session,
        )
    )
