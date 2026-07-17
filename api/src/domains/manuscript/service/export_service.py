"""작품 원고 zip 내보내기 — 부(episode)=폴더 / 회차(chapter)=txt 구조로 인메모리 조립.

``manuscript_service.py``의 ``export_manuscript_zip``이 쓰는 순수 헬퍼. 파이썬
stdlib ``zipfile``만으로 ``io.BytesIO``에 담아 조립하며 파일시스템에는 쓰지 않는다.
"""

from __future__ import annotations

import io
import re
import zipfile

from domains.manuscript.models import Chapter, Episode

# 파일시스템 금지문자(윈도우 기준 최대 상위집합) + 제어문자.
_FORBIDDEN_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')

# eco: 파일시스템 경로 세그먼트의 통상 상한(255바이트)에 prefix/suffix(번호·확장자) 여유를
# 남기기 위한 상한. title은 문자 수(255)까지 허용되지만 한글 등 멀티바이트 문자는
# 문자당 최대 3~4바이트라 그대로 두면 세그먼트가 255바이트를 넘어 압축 해제가 실패한다.
_MAX_SEGMENT_BYTES = 200


def _truncate_utf8(value: str, max_bytes: int) -> str:
    """UTF-8 바이트 기준으로 안전하게 자른다(멀티바이트 문자 중간 절단 방지)."""
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def _sanitize_name(name: str) -> str:
    """파일/폴더명 한 세그먼트를 안전하게 치환.

    zip arcname의 세그먼트 하나로만 쓰인다(폴더/파일 조합은 항상 우리가 "/"로 직접
    수행). 파일시스템 금지문자와 경로 traversal에 쓰일 수 있는 조각(``..``, 선행/
    후행 ``.``·공백)을 모두 제거한다 — 그러지 않으면 압축 해제 시 디렉터리 밖으로
    파일이 써질 수 있다(보안 경계). 바이트 길이도 상한 내로 잘라 파일시스템 경로
    세그먼트 한도 초과로 인한 압축 해제 실패를 막는다.
    """
    sanitized = _FORBIDDEN_CHARS.sub("_", name)
    sanitized = sanitized.replace("..", "_")
    sanitized = _truncate_utf8(sanitized, _MAX_SEGMENT_BYTES)
    sanitized = sanitized.strip(" .")
    return sanitized or "_"


def _part_folder_name(title: str, order_no: int) -> str:
    raw = title if title.strip() else f"제{order_no}부"
    return _sanitize_name(raw)


def _chapter_file_name(order_no: int, title: str) -> str:
    return f"{order_no:03d}화_{_sanitize_name(title)}.txt"


def _chapter_text(title: str, body: str) -> str:
    return f"{title}\n\n{body}"


def build_manuscript_zip(
    episodes_with_content: list[tuple[Episode, list[Chapter]]],
) -> bytes:
    """부→회차 구조를 zip 바이트로 조립한다.

    입력은 이미 order_index 순으로 정렬돼 있어야 한다(``ManuscriptService``가 보장).
    """
    buffer = io.BytesIO()
    used_folders: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for episode_no, (episode, chapters) in enumerate(episodes_with_content, start=1):
            folder = _part_folder_name(episode.title, episode_no)
            if folder in used_folders:
                # 부 title에는 유일성 제약이 없어 서로 다른 두 부가 같은 폴더명으로
                # sanitize될 수 있다 — 그대로 두면 zip arcname이 충돌해 먼저 쓴 부의
                # 회차 본문이 조용히 덮어써진다. order_no는 루프마다 유일하므로 이를
                # 덧붙여 충돌을 피한다.
                folder = f"{folder}_{episode_no}"
            used_folders.add(folder)
            for chapter_no, chapter in enumerate(chapters, start=1):
                filename = _chapter_file_name(chapter_no, chapter.title)
                zf.writestr(f"{folder}/{filename}", _chapter_text(chapter.title, chapter.body))
    return buffer.getvalue()
