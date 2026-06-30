"""운영자 admin CLI — 이메일 링크 없이 회원 인증 / admin 역할 부여.

명령 로직은 ``domains.auth.admin_ops``에 있고(테스트됨), 이 파일은 인자 파싱 +
DB 세션 오픈 + commit + 종료 코드만 담당하는 얇은 엔트리다. DB가 기동돼 있어야 한다.

Usage::

    uv run python scripts/manage.py verify-email <email>
    uv run python scripts/manage.py grant-admin <email>

    # task (저장소 루트에서)
    task api:verify-email -- <email>
    task api:grant-admin  -- <email>
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# src layout: PYTHONPATH=src 미설정 환경에서도 import 가능하도록 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from core.database import AsyncSessionFactory
from domains.auth.admin_ops import UserNotFoundError, grant_admin, verify_email
from domains.auth.repository import AuthRepository

_COMMANDS = {
    "verify-email": (verify_email, "회원 이메일을 인증 처리 (is_verified=true)"),
    "grant-admin": (grant_admin, "회원에게 admin 역할 부여 (없으면 역할 생성)"),
}


async def _run(command: str, email: str) -> str:
    op = _COMMANDS[command][0]
    async with AsyncSessionFactory() as session:
        repo = AuthRepository(session)
        message = await op(repo, email)
        await session.commit()
        return message


def main() -> None:
    parser = argparse.ArgumentParser(prog="manage", description="StoryWeaver 운영자 CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, (_op, help_text) in _COMMANDS.items():
        p = sub.add_parser(name, help=help_text)
        p.add_argument("email", help="대상 회원 이메일")
    args = parser.parse_args()

    try:
        message = asyncio.run(_run(args.command, args.email))
    except UserNotFoundError as exc:
        print(f"오류: {exc}", file=sys.stderr)
        sys.exit(1)
    print(message)


if __name__ == "__main__":
    main()
