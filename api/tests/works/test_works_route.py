"""작품 HTTP 라우트 — 상태코드·camelCase 계약·인증/소유권 오류 매핑 검증.

실 DB/인증 없이 서비스와 current-user 의존성을 override한다(auth 라우트 테스트 패턴).
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from core.exceptions import NotFoundError
from domains.auth.security import get_current_user
from domains.works.models import Work
from domains.works.router import _get_service, router


def _work(user_id: uuid.UUID, **over: Any) -> Work:
    base: dict[str, Any] = {
        "id": uuid.uuid4(),
        "user_id": user_id,
        "title": "회귀한 무사",
        "short_label": "회",
        "genre": "무협",
        "sub_genre": "회귀",
        "keywords": ["회귀"],
        "style": "간결체",
        "status": "구상",
        "cover_theme": "dark",
    }
    base.update(over)
    return Work(**base)


class FakeWorksService:
    def __init__(self) -> None:
        self.not_found = False

    async def list_works(self, user_id: uuid.UUID) -> list[Work]:
        return [_work(user_id)]

    async def create_work(self, user_id: uuid.UUID, data: Any) -> Work:
        return _work(user_id, title=data.title)

    async def get_work(self, work_id: uuid.UUID, user_id: uuid.UUID) -> Work:
        if self.not_found:
            raise NotFoundError("Work")
        return _work(user_id, id=work_id)

    async def update_work(self, work_id: uuid.UUID, user_id: uuid.UUID, data: Any) -> Work:
        if self.not_found:
            raise NotFoundError("Work")
        return _work(user_id, id=work_id)

    async def delete_work(self, work_id: uuid.UUID, user_id: uuid.UUID) -> None:
        if self.not_found:
            raise NotFoundError("Work")


@pytest.fixture
def service() -> FakeWorksService:
    return FakeWorksService()


@pytest.fixture
def client(service: FakeWorksService) -> AsyncClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[_get_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid.uuid4())
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_create_work_returns_201_with_camelcase(client: AsyncClient) -> None:
    async with client:
        resp = await client.post(
            "/api/v1/works",
            json={"title": "회귀한 무사", "genre": "무협", "keywords": ["회귀"], "style": "간결체"},
        )
    assert resp.status_code == 201
    body = resp.json()
    # 프론트 Work 계약(camelCase)
    for key in ("shortLabel", "subGenre", "coverTheme", "lastEditedLabel", "stats", "reviewSummary"):
        assert key in body
    assert body["stats"]["wordsUnit"] == "천자"
    assert body["reviewSummary"]["scenes"] == 0


async def test_create_work_rejects_missing_title(client: AsyncClient) -> None:
    async with client:
        resp = await client.post("/api/v1/works", json={"genre": "무협", "style": "간결체"})
    assert resp.status_code == 422


async def test_list_works_returns_array(client: AsyncClient) -> None:
    async with client:
        resp = await client.get("/api/v1/works")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert resp.json()[0]["genre"] == "무협"


async def test_get_work_404_when_not_owned(client: AsyncClient, service: FakeWorksService) -> None:
    service.not_found = True
    async with client:
        resp = await client.get(f"/api/v1/works/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_delete_work_returns_204(client: AsyncClient) -> None:
    async with client:
        resp = await client.delete(f"/api/v1/works/{uuid.uuid4()}")
    assert resp.status_code == 204
