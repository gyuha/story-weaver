"""Runtime tests for the FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest
from fastapi import Response
from httpx import ASGITransport, AsyncClient

import main


class FakeRedis:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail

    async def ping(self) -> bool:
        if self.fail:
            raise RuntimeError("redis unavailable")
        return True


class FakeConnection:
    async def __aenter__(self) -> FakeConnection:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, statement: Any) -> None:
        assert str(statement) == "SELECT 1"


class FakeEngine:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail

    def connect(self) -> FakeConnection:
        if self.fail:
            raise RuntimeError("database unavailable")
        return FakeConnection()


class FakeReader:
    def __init__(self, banner: bytes = b"220 mailpit ready\r\n") -> None:
        self.banner = banner

    async def readline(self) -> bytes:
        return self.banner


class FakeWriter:
    def __init__(self) -> None:
        self.closed = False
        self.data = b""

    def write(self, data: bytes) -> None:
        self.data += data

    async def drain(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        assert self.closed is True


@pytest.fixture
def patched_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get_redis_client() -> FakeRedis:
        return FakeRedis()

    async def fake_open_connection(host: str, port: int) -> tuple[FakeReader, FakeWriter]:
        assert host == main.settings.mail_server
        assert port == main.settings.mail_port
        return FakeReader(), FakeWriter()

    monkeypatch.setattr("core.database.engine", FakeEngine())
    monkeypatch.setattr("core.redis.get_redis_client", fake_get_redis_client)
    monkeypatch.setattr(main.asyncio, "open_connection", fake_open_connection)


@pytest.mark.asyncio
async def test_health_endpoint_returns_environment() -> None:
    transport = ASGITransport(app=main.create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": main.settings.app_env.value}


@pytest.mark.asyncio
async def test_ready_endpoint_reports_all_dependencies_ok(patched_dependencies: None) -> None:
    transport = ASGITransport(app=main.create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "postgres": "ok",
        "redis": "ok",
        "mailpit": "ok",
    }


@pytest.mark.asyncio
async def test_ready_endpoint_reports_degraded_dependency(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_get_redis_client() -> FakeRedis:
        return FakeRedis(fail=True)

    async def fake_open_connection(host: str, port: int) -> tuple[FakeReader, FakeWriter]:
        return FakeReader(), FakeWriter()

    monkeypatch.setattr("core.database.engine", FakeEngine())
    monkeypatch.setattr("core.redis.get_redis_client", failing_get_redis_client)
    monkeypatch.setattr(main.asyncio, "open_connection", fake_open_connection)

    transport = ASGITransport(app=main.create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/ready")

    body = response.json()
    assert response.status_code == 503
    assert body["status"] == "degraded"
    assert body["postgres"] == "ok"
    assert body["redis"] == "error: redis unavailable"
    assert body["mailpit"] == "ok"


@pytest.mark.asyncio
async def test_lifespan_warms_and_closes_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    closed = False

    async def fake_get_redis_client() -> FakeRedis:
        return FakeRedis()

    async def fake_close_redis_client() -> None:
        nonlocal closed
        closed = True

    monkeypatch.setattr(main, "configure_logging", lambda **kwargs: None)
    monkeypatch.setattr("core.redis.get_redis_client", fake_get_redis_client)
    monkeypatch.setattr("core.redis.close_redis_client", fake_close_redis_client)

    async with main.lifespan(main.create_app()):
        assert closed is False

    assert closed is True


@pytest.mark.asyncio
async def test_lifespan_shutdown_does_not_block_default_executor_teardown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Embedding warmup must never leave work running in the loop's default executor.

    uvicorn's asyncio.Runner.close() calls ``loop.shutdown_default_executor()`` on
    process exit, which blocks until every default-executor work item finishes. If
    warmup is submitted via ``asyncio.to_thread`` (-> the loop's default
    ThreadPoolExecutor), cancelling the wrapping Task returns immediately but does
    NOT stop the already-running thread — so ``shutdown_default_executor()`` still
    blocks for the remainder of the model load, freezing dev's ``uvicorn --reload``
    restart (or Ctrl+C shutdown) even though the lifespan's own shutdown code
    "returned" quickly.
    """
    import domains.memory.embedding_client as embedding_client_module

    def _slow_get_model() -> object:
        time.sleep(0.5)
        return object()

    monkeypatch.setattr(embedding_client_module, "_get_model", _slow_get_model)

    async def fake_get_redis_client() -> FakeRedis:
        return FakeRedis()

    async def fake_close_redis_client() -> None:
        return None

    monkeypatch.setattr(main, "configure_logging", lambda **kwargs: None)
    monkeypatch.setattr("core.redis.get_redis_client", fake_get_redis_client)
    monkeypatch.setattr("core.redis.close_redis_client", fake_close_redis_client)

    cm = main.lifespan(main.create_app())
    await cm.__aenter__()
    # Give the warmup work an actual chance to reach the executor thread and
    # start running _slow_get_model (i.e. past the point where cancel() could
    # still prevent it from ever starting) before we shut down.
    await asyncio.sleep(0.1)
    await cm.__aexit__(None, None, None)

    loop = asyncio.get_running_loop()
    started = time.monotonic()
    await asyncio.wait_for(loop.shutdown_default_executor(), timeout=2)
    elapsed = time.monotonic() - started

    assert elapsed < 0.2, (
        "lifespan shutdown left warmup work running in the loop's default "
        "executor; loop.shutdown_default_executor() (what asyncio.Runner.close() "
        f"calls on process exit) took {elapsed:.2f}s instead of returning "
        "immediately, which would block uvicorn --reload / process shutdown."
    )


@pytest.mark.asyncio
async def test_await_if_needed_accepts_plain_value() -> None:
    response = Response(status_code=204)

    assert await main._await_if_needed(response.status_code) == 204
