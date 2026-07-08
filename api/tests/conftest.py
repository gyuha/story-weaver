"""Root-level pytest conftest for the StoryWeaver test suite.

Shared fixtures available across all test modules:

* :func:`settings_cache_clear` — automatically clears :func:`get_settings`
  LRU cache before and after every test so monkeypatched env vars don't leak
  across tests.

* :func:`env_openai` / :func:`env_ollama` — monkeypatched environment
  variable sets for each LLM provider.  These are defined in
  ``tests/chat/conftest.py`` and may be referenced by chat test modules.

* :func:`_close_redis_between_tests` — closes ``core.redis``'s shared client
  singleton after every test (no-op if a test never touched Redis). Needed
  because pytest-asyncio gives each test its own event loop, but the
  singleton is created once and bound to whichever loop first used it —
  without this, a later test reusing the singleton on a different loop fails
  with "Future attached to a different loop".

This file itself makes no network/DB/Redis calls — it only tears down
connections that application code under test may have created.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from core.config import get_settings
from core.redis import close_redis_client

# ---------------------------------------------------------------------------
# Settings cache isolation
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def settings_cache_clear() -> None:  # type: ignore[misc]
    """Clear :func:`get_settings` LRU cache before and after every test.

    :func:`~app.core.config.get_settings` is decorated with
    ``@lru_cache(maxsize=1)``.  Without cache invalidation, one test's
    ``monkeypatch.setenv`` calls bleed into the next test because the cached
    :class:`~app.core.config.Settings` object was built from the
    previous test's environment.

    This fixture runs automatically for **every** test (``autouse=True``).

    Usage in test modules (implicit — no explicit request needed)::

        def test_something(monkeypatch):
            monkeypatch.setenv("LLM_PROVIDER", "ollama")
            # Settings are re-read from the current environment — no stale cache
            from core.config import get_settings
            s = get_settings()
            assert s.llm_provider.value == "ollama"
    """
    get_settings.cache_clear()
    yield  # type: ignore[misc]
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Redis singleton isolation (per-test event loop)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def _close_redis_between_tests() -> AsyncIterator[None]:
    """Close the shared Redis client singleton after every test.

    See module docstring — prevents "Future attached to a different loop"
    when a later test reuses a singleton created on a previous test's loop.
    """
    yield
    await close_redis_client()
