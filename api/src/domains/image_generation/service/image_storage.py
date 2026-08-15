"""이미지 바이너리 파일시스템 저장 (ADR `260811-234511`).

저장 루트(``image_storage_root`` 설정) 아래 ``<work_id>/<entity_id>/<image_id>.jpg``
경로에 쓰고 읽고 지운다. 공개 함수는 ``uuid.UUID``만 받아 ``../`` 같은 경로 조작이
구조적으로 불가능하고, 내부 경로 조립(``_path_for``)도 조립 결과가 저장 루트 밖으로
벗어나면 예외를 던져 이중으로 막는다. 객체 스토리지로 옮길 때는 이 모듈만 교체하면
된다.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from core.config import get_settings


def _storage_root() -> Path:
    """설정에서 저장 루트를 절대 경로로 얻는다."""
    return Path(get_settings().image_storage_root).resolve()


def _resolve_under_root(*parts: str) -> Path:
    """저장 루트 아래 parts를 이어붙이고, 루트 밖으로 벗어나면 거부한다."""
    root = _storage_root()
    path = root.joinpath(*parts).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Path escapes storage root: {path}")
    return path


def _path_for(work_id: str, entity_id: str, image_id: str) -> Path:
    """``<root>/<work_id>/<entity_id>/<image_id>.jpg`` 경로를 조립·검증한다."""
    return _resolve_under_root(work_id, entity_id, f"{image_id}.jpg")


def save_image(work_id: uuid.UUID, entity_id: uuid.UUID, image_id: uuid.UUID, data: bytes) -> str:
    """이미지 바이트를 저장하고 저장 루트 기준 상대 경로를 돌려준다 (DB에 넣을 값)."""
    path = _path_for(str(work_id), str(entity_id), str(image_id))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path.relative_to(_storage_root()))


def read_image(work_id: uuid.UUID, entity_id: uuid.UUID, image_id: uuid.UUID) -> bytes:
    """이미지 바이트를 읽는다. 없으면 ``FileNotFoundError``."""
    path = _path_for(str(work_id), str(entity_id), str(image_id))
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")
    return path.read_bytes()


def delete_images_for_entity(work_id: uuid.UUID, entity_id: uuid.UUID) -> int:
    """그 카드의 이미지 파일을 전부 지우고 지운 개수를 돌려준다. 없으면 0(예외 아님)."""
    entity_dir = _resolve_under_root(str(work_id), str(entity_id))
    if not entity_dir.is_dir():
        return 0
    deleted = len(list(entity_dir.glob("*.jpg")))
    shutil.rmtree(entity_dir)
    return deleted
