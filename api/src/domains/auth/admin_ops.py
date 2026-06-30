"""운영자용 auth 조작 — 관리자 CLI(``scripts/manage.py``)가 호출한다.

이메일 링크 없이 회원을 수동 인증하거나 admin 역할을 부여하는 두 조작을
repository 위에서 수행한다. repository만 받으므로 fake로 단위 테스트된다.
멱등하며, 없는 이메일은 :class:`UserNotFoundError`로 알린다.

용어: 여기 "회원 인증"은 이메일 인증(``User.is_verified``)이며, 운영자 허가인
계정 승인(pending→approved)과는 다른 축이다(CONTEXT 글로서리 참조).
"""

from __future__ import annotations

from domains.auth.repository import AuthRepository

ADMIN_ROLE = "admin"


class UserNotFoundError(Exception):
    """주어진 이메일의 회원이 없을 때."""

    def __init__(self, email: str) -> None:
        super().__init__(f"User not found: {email}")
        self.email = email


async def verify_email(repo: AuthRepository, email: str) -> str:
    """회원의 이메일을 인증 처리(``is_verified=true``)한다. 멱등."""
    user = await repo.get_user_by_email(email)
    if user is None:
        raise UserNotFoundError(email)
    if user.is_verified:
        return f"{email} 는 이미 인증된 계정입니다 (변경 없음)."
    await repo.mark_user_verified(user.id)
    return f"{email} 를 인증 처리했습니다 (is_verified=true)."


async def grant_admin(repo: AuthRepository, email: str) -> str:
    """회원에게 ``admin`` 역할을 부여한다(없으면 역할 생성). 멱등."""
    user = await repo.get_user_by_email(email)
    if user is None:
        raise UserNotFoundError(email)
    role = await repo.get_or_create_role(ADMIN_ROLE)
    if role in user.roles:
        return f"{email} 는 이미 admin 역할을 가지고 있습니다 (변경 없음)."
    await repo.assign_role_to_user(user, role)
    return f"{email} 에게 admin 역할을 부여했습니다."
