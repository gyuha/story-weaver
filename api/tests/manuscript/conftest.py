"""manuscript 테스트 픽스처 — 실 DB 커넥션 풀 정리.

pytest-asyncio는 테스트마다 새 이벤트 루프를 쓰지만 `core.database.engine`은 모듈
임포트 시 한 번만 만들어진다 — 풀에 남은 커넥션이 이전 루프에 묶여 있으면 다음
테스트에서 깨진다. 각 테스트 뒤 풀을 비워 다음 테스트가 새 루프에서 새 커넥션을
열게 한다(works 도메인 test_works_isolation.py와 동일 패턴).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from core.database import engine


@pytest.fixture(autouse=True)
async def _dispose_engine_pool() -> AsyncIterator[None]:
    yield
    await engine.dispose()
