#!/usr/bin/env python3
"""forge 계획·실행 문서를 쓴 직후, 검증되지 않은 사실 주장을 점검하게 만드는 훅.

왜 있는가 — 이 저장소에서 네 사이클 연속 같은 실수가 났다:
  #61  "트리 전체를 grep해 소비자를 확정했다"고 계획에 썼으나 파일 두 개만 봤다 → 세 번째 소비자 누락
  #62  표본 1개로 "이 모델은 그 증상이 없다"고 단정 → DB 로그로 40% 발생 반박
  #64  식별자만 grep해 영향 테스트를 4개로 추정 → 실제 8개 (문자열까지 grep해야 했다)
  #65  "shield 없이도 동작할 것"이라는 뻔한 구현 → 실측으로 탈락 (조용히 실패하는 종류였다)

훅이 할 수 없는 일: 어떤 문장이 검증된 주장인지 판별하는 것. 그래서 이것은 **차단이
아니라 점검 요청**이다. 기계적으로 확인할 수 있는 것(계획서에 검증 노트 절이 있는가)만
검사하고, 나머지는 그 자리에서 되묻는다.

제거 방법: .claude/settings.local.json 의 PostToolUse에서 이 항목을 지운다.
"""

from __future__ import annotations

import json
import re
import sys

# 이 훅이 반응하는 문서 — forge 루프의 계획·실행 기록만.
_TARGET = re.compile(r"\.forge/(plan\.md|run\.md|backlog/[^/]+\.md)$")

# 계획서가 반드시 갖춰야 하는 절(fg-ask가 쓰는 표제). 없으면 과거 함정을 안 읽었다는 신호.
_VERIFY_SECTION = "검증 노트"

_ASK = """\
[forge 주장 점검] 방금 {path} 를 썼습니다. 넘어가기 전에 확인하십시오.

1. 이 문서의 **사실 주장**마다 어떻게 확인했는지가 적혀 있습니까?
   "전수 grep했다" "이 모델은 그렇지 않다" "테스트 N개가 영향받는다" 같은 문장은
   확인 수단(실행한 명령·관측한 출력)을 같이 적거나, 못 적으면 "확인 필요"로 남기십시오.
   이 저장소는 이 실수를 #61·#62·#64·#65 네 사이클 연속으로 냈습니다.

2. 조용히 실패할 수 있는 변경입니까? (취소·타임아웃·연결 끊김·비동기 스코프·fire-and-forget)
   그렇다면 **실행 전에 실측**하십시오. 뻔해 보이는 구현이 아무 일도 안 하는 경우가 있습니다.

3. 방어 장치(테스트·가드)를 넣었다면, **그것을 제거했을 때 실제로 red가 되는지** 확인했습니까?
   확인하지 않으면 방어하는 척하는 테스트가 남습니다.

4. UAT 지시를 적었다면 **화면 경로**와 **코드에서 읽은 정확한 UI 레이블**을 인용했습니까?
   "메모리 패널의 챗 탭"처럼 쓰면 사용자가 다른 화면을 테스트합니다(#66에서 실제로
   한 라운드가 버려졌습니다 — 실제 레이블은 `채팅`이고 위치는 집필 화면 오른쪽 패널).
   그리고 **타이밍에 의존하는 항목은 브라우저 UAT로 관측하려 하지 마십시오** — 테스트로
   고정하고, UAT는 사람이 확실히 볼 수 있는 것만 맡기십시오.

5. "기존 방어 장치 안에서의 변경"이라는 이유로 실측을 면제하려 하고 있습니까?
   **방어 장치가 있다는 것과 새 코드가 그 안에서 발동한다는 것은 다른 명제입니다.**
   #66의 계획이 정확히 그 이유로 실스택 테스트를 생략했고, 그 판단은 근거가 없었습니다
   (shield는 await을 살려주지만 플래그가 세워지는지는 별개 문제였습니다).
{extra}"""


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # 입력을 못 읽으면 조용히 통과 — 훅이 작업을 막아선 안 된다.

    tool_input = payload.get("tool_input") or {}
    path = str(tool_input.get("file_path") or "")
    if not _TARGET.search(path):
        return 0

    extra = ""
    if path.endswith(("plan.md",)) or "/backlog/" in path:
        content = str(tool_input.get("content") or "")
        # Edit 도구는 content가 없다 — 그때는 절 검사를 건너뛴다(오탐 방지).
        if content and _VERIFY_SECTION not in content:
            extra = (
                f"\n6. 이 계획서에 '{_VERIFY_SECTION}' 절이 없습니다. 직전 회고의 "
                "'다음에 다르게 할 것'을 읽고, 이번 작업에서 재발할 수 있는 함정을 "
                "그 절에 구체적으로 적으십시오 — 이번 사이클에서 실제로 효과가 있었던 장치입니다."
            )

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": _ASK.format(path=path, extra=extra),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
