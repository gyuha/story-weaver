"""운영자용 auth 조작 — 관리자 CLI(``scripts/manage.py``)가 호출한다.

이메일 링크 없이 회원을 수동 인증하거나, admin 역할을 부여하거나, 비밀번호를
강제로 재설정하는 조작을 repository 위에서 수행한다. repository만 받으므로
fake로 단위 테스트된다. verify-email/grant-admin은 멱등하며, 없는 이메일은
:class:`UserNotFoundError`로 알린다.

용어: 여기 "회원 인증"은 이메일 인증(``User.is_verified``)이며, 운영자 허가인
계정 승인(pending→approved)과는 다른 축이다(CONTEXT 글로서리 참조).
"""

from __future__ import annotations

from domains.auth.repository import AuthRepository
from domains.auth.schemas.auth_schemas import validate_password_strength
from domains.auth.security import hash_password

ADMIN_ROLE = "admin"
_MIN_PASSWORD_LENGTH = 8
_MAX_PASSWORD_LENGTH = 128


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


async def reset_password(repo: AuthRepository, email: str, new_password: str) -> str:
    """회원의 비밀번호를 강제로 재설정하고 기존 세션(refresh token)을 전부 폐기한다.

    강도 정책은 signup/change-password와 동일(``validate_password_strength``).
    세션 전부 폐기는 ``auth_service.confirm_password_reset``과 같은 보안 원칙이다.

    Raises
    ------
    UserNotFoundError
        해당 이메일의 회원이 없을 때.
    ValueError
        새 비밀번호가 길이·강도 정책을 만족하지 않을 때.
    """
    user = await repo.get_user_by_email(email)
    if user is None:
        raise UserNotFoundError(email)
    if not (_MIN_PASSWORD_LENGTH <= len(new_password) <= _MAX_PASSWORD_LENGTH):
        raise ValueError(
            f"Password must be between {_MIN_PASSWORD_LENGTH} and "
            f"{_MAX_PASSWORD_LENGTH} characters."
        )
    validate_password_strength(new_password)

    hashed = hash_password(new_password)
    await repo.update_user_password(user.id, hashed)
    await repo.revoke_all_user_refresh_tokens(user.id)
    return f"{email} 의 비밀번호를 재설정했습니다 (기존 세션 전부 폐기)."
