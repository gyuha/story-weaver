"""인증 사용자 비밀번호 변경 (AuthService.change_password) 계약.

비번 리셋 확인 플로우(confirm_password_reset)와 같은 "변경 후 전체 세션 revoke" 패턴.
fake_repo + auth_service 픽스처(인메모리)로 단위 테스트한다.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from core.exceptions import ConflictError, UnauthorizedError
from domains.auth.security import hash_password, verify_password

_CURRENT = "CurrentPass1@"
_NEW = "NewPass2@"


async def _make_user(fake_repo: Any, password: str | None = _CURRENT) -> Any:
    hashed = hash_password(password) if password is not None else None
    return await fake_repo.create_user("writer@example.com", hashed)


async def test_change_password_updates_hash_and_revokes_sessions(
    auth_service: Any, fake_repo: Any
) -> None:
    user = await _make_user(fake_repo)
    fake_repo.revoke_all_user_refresh_tokens = AsyncMock()

    await auth_service.change_password(user, _CURRENT, _NEW)

    assert verify_password(_NEW, user.hashed_password)
    assert not verify_password(_CURRENT, user.hashed_password)
    fake_repo.revoke_all_user_refresh_tokens.assert_awaited_once_with(user.id)


async def test_change_password_rejects_wrong_current(auth_service: Any, fake_repo: Any) -> None:
    user = await _make_user(fake_repo)
    with pytest.raises(UnauthorizedError):
        await auth_service.change_password(user, "WrongCurrent9@", _NEW)


async def test_change_password_rejects_same_as_current(auth_service: Any, fake_repo: Any) -> None:
    user = await _make_user(fake_repo)
    with pytest.raises(ConflictError):
        await auth_service.change_password(user, _CURRENT, _CURRENT)


async def test_change_password_rejects_social_account(auth_service: Any, fake_repo: Any) -> None:
    user = await _make_user(fake_repo, password=None)  # OAuth-only, no password
    with pytest.raises(ConflictError):
        await auth_service.change_password(user, "anything", _NEW)
