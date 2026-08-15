"""image_generation 도메인 S1 — 이미지 저장 모듈 테스트 (TDD, ADR 260811-234511).

``work_id``/``entity_id`` 스코프 파일시스템 경로에 이미지 바이트를 쓰고 읽고
지우는 :mod:`domains.image_generation.service.image_storage`를 검증한다.
경로 탈출 방어(공개 API의 ``uuid.UUID`` 타입 + 내부 조립 함수 ``_path_for``의
재검증)가 실제로 동작하는지가 이 파일의 핵심이다. DB·네트워크 없음.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from domains.image_generation.service import image_storage

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _isolated_storage_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """저장 루트를 tmp_path로 격리한다 (conftest의 settings_cache_clear가 캐시를 비운다)."""
    monkeypatch.setenv("IMAGE_STORAGE_ROOT", str(tmp_path))


def test_save_then_read_round_trips() -> None:
    work_id, entity_id, image_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    data = b"\xff\xd8\xfffake-jpeg-bytes"

    relative_path = image_storage.save_image(work_id, entity_id, image_id, data)

    assert relative_path == f"{work_id}/{entity_id}/{image_id}.jpg"
    assert image_storage.read_image(work_id, entity_id, image_id) == data


def test_delete_images_for_entity_removes_files_and_returns_count() -> None:
    work_id, entity_id = uuid.uuid4(), uuid.uuid4()
    image_ids = [uuid.uuid4(), uuid.uuid4()]
    for image_id in image_ids:
        image_storage.save_image(work_id, entity_id, image_id, b"data")

    deleted = image_storage.delete_images_for_entity(work_id, entity_id)

    assert deleted == 2
    for image_id in image_ids:
        with pytest.raises(FileNotFoundError):
            image_storage.read_image(work_id, entity_id, image_id)


def test_delete_images_for_entity_missing_entity_returns_zero() -> None:
    assert image_storage.delete_images_for_entity(uuid.uuid4(), uuid.uuid4()) == 0


def test_read_missing_image_raises_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        image_storage.read_image(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())


def test_path_for_rejects_path_escape() -> None:
    with pytest.raises(ValueError, match="escapes"):
        image_storage._path_for("../../etc", "entity", "image")


def test_storage_root_is_isolated_to_tmp_path(tmp_path: Path) -> None:
    work_id, entity_id, image_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    image_storage.save_image(work_id, entity_id, image_id, b"data")

    assert (tmp_path / str(work_id) / str(entity_id) / f"{image_id}.jpg").is_file()
