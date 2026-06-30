"""Admin CLI operations (scripts/manage.py 로직) + get_or_create_role 계약 테스트.

명령 로직은 ``domains.auth.admin_ops``에 repo 기반으로 두어 ``FakeAuthRepository``로
단위 테스트한다(프로젝트의 fake 기반 스타일). ``get_or_create_role``은 실 repo를
capturing-session 스텁으로 검증한다(``test_refresh_repository`` 패턴).
"""

from __future__ import annotations

from typing import Any

import pytest

from domains.auth.admin_ops import UserNotFoundError, grant_admin, verify_email
from domains.auth.repository import AuthRepository

# ── command logic (fake_repo) ────────────────────────────────────────────────


async def test_verify_email_marks_unverified_user(fake_repo: Any) -> None:
    user = await fake_repo.create_user("u@example.com")  # is_verified=False
    msg = await verify_email(fake_repo, "u@example.com")
    assert user.is_verified is True
    assert "인증" in msg


async def test_verify_email_is_idempotent_when_already_verified(fake_repo: Any) -> None:
    user = await fake_repo.create_user("u@example.com")
    user.is_verified = True
    msg = await verify_email(fake_repo, "u@example.com")
    assert "이미" in msg  # 변경 없음 안내


async def test_verify_email_unknown_email_raises(fake_repo: Any) -> None:
    with pytest.raises(UserNotFoundError):
        await verify_email(fake_repo, "nobody@example.com")


async def test_grant_admin_assigns_admin_role(fake_repo: Any) -> None:
    user = await fake_repo.create_user("u@example.com")
    msg = await grant_admin(fake_repo, "u@example.com")
    assert any(r.name == "admin" for r in user.roles)
    assert "admin" in msg


async def test_grant_admin_is_idempotent(fake_repo: Any) -> None:
    user = await fake_repo.create_user("u@example.com")
    await grant_admin(fake_repo, "u@example.com")
    msg = await grant_admin(fake_repo, "u@example.com")  # 두 번째
    assert sum(1 for r in user.roles if r.name == "admin") == 1
    assert "이미" in msg


async def test_grant_admin_unknown_email_raises(fake_repo: Any) -> None:
    with pytest.raises(UserNotFoundError):
        await grant_admin(fake_repo, "nobody@example.com")


# ── get_or_create_role (real repository, stub session) ───────────────────────


class _RoleResult:
    def __init__(self, role: Any) -> None:
        self._role = role

    def scalar_one_or_none(self) -> Any:
        return self._role


class _StubSession:
    def __init__(self, existing: Any) -> None:
        self._existing = existing
        self.added: list[Any] = []

    async def execute(self, _statement: Any) -> _RoleResult:
        return _RoleResult(self._existing)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None


async def test_get_or_create_role_returns_existing_without_insert() -> None:
    from domains.auth.models import Role

    existing = Role(name="admin")
    session = _StubSession(existing)
    repo = AuthRepository(session)  # type: ignore[arg-type]

    role = await repo.get_or_create_role("admin")

    assert role is existing
    assert session.added == []


async def test_get_or_create_role_creates_when_absent() -> None:
    session = _StubSession(None)
    repo = AuthRepository(session)  # type: ignore[arg-type]

    role = await repo.get_or_create_role("admin")

    assert role.name == "admin"
    assert len(session.added) == 1
