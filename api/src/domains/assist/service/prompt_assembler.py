"""집필 보조 프롬프트 조립기 (ai-pipeline.md 3.1 표, plan.md M3-S1).

작업 종류(:class:`~domains.assist.tier_routing.TaskType`)별로 공통 베이스 + 작업별
지시 + 메모리 주입 수준(풀세트/경량/최소)을 조립해, ``LLMClient.ainvoke``/``astream``에
바로 넘길 수 있는 ``[SystemMessage, HumanMessage]``를 반환한다.
"""

from __future__ import annotations

from collections.abc import Sequence

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from domains.assist.schemas import (
    AssistTaskInput,
    CharacterSpeechProfile,
    ContinueInput,
    CorrectInput,
    DialogueInput,
    DraftInput,
    InfillInput,
    StyleInput,
    SummaryInput,
    TitleInput,
)
from domains.assist.tier_routing import TaskType
from domains.memory.schemas import MemoryItemResponse, MemoryItemType

_COMMON_BASE = (
    "당신은 웹소설 작가의 집필을 보조하는 AI입니다. "
    "이 작품의 장르는 '{genre}', 문체는 '{style}'입니다 — 이 장르와 문체를 따르세요.\n"
    "아래 메모리 컨텍스트는 사실 근거입니다. 메모리 컨텍스트와 모순되게 쓰지 마세요."
)

#: 작업별 시스템 지시 골자 (ai-pipeline.md 3.1 표 "시스템 프롬프트 골자" 열).
_TASK_INSTRUCTION: dict[TaskType, str] = {
    TaskType.continue_: (
        "커서 직전 본문을 이어 다음 문장 3~5개 후보를 생성하세요. "
        "후보끼리는 서로 다른 전개여야 하며, 메모리 컨텍스트의 설정·상태와 모순되면 안 됩니다.\n"
        # 형식을 명시하지 않으면 모델이 호출마다 표류한다(로그 실측: `1.` / `**후보 N**` /
        # `### 후보 N` 3형태). JSONL은 후보 본문의 개행이 \n으로 이스케이프되어 줄 경계와
        # 충돌하지 않으므로 스트리밍 중 완결된 줄만 골라 증분 파싱할 수 있다(task #62).
        '출력 형식: 후보 하나를 JSON 객체 한 줄로 쓰세요 — {"text":"후보 본문"} 형태로, '
        "한 줄에 후보 하나씩. 번호·라벨(예: 후보 1)·제목·머리말·설명·코드펜스(```)를 "
        "붙이지 말고, 배열이나 감싸는 객체로 묶지도 마세요."
    ),
    TaskType.infill: (
        "빈 구간 앞 문장과 뒤 문장 사이를 자연스럽게 잇는 문장을 생성하세요. "
        "앞뒤 문장은 다시 쓰지 말고 사이만 채우고, 톤을 일치시키세요."
    ),
    TaskType.dialogue: (
        "작가의 의도 서술을 실제 소설의 대사와 지문으로 변환하세요. "
        "등장 인물의 말투를 모사하고, 메타 설명 없이 본문만 출력하세요."
    ),
    TaskType.style: (
        "의미와 사건은 보존한 채 어휘·어조·문장 리듬만 목표 문체로 재작성하세요. "
        "고유명사와 설정은 그대로 보존하세요."
    ),
    TaskType.correct: (
        "맞춤법, 어색한 표현, 중복 어휘를 최소 침습으로 교정하세요. "
        "의미·문체·고유명사는 바꾸지 마세요."
    ),
    TaskType.title_: (
        "아래 본문을 근거로 이 화(chapter)에 어울리는 짧은 제목 하나만 지으세요. "
        "따옴표·접두어·설명·개행 없이 제목 텍스트만 출력하세요."
    ),
    TaskType.summary: (
        "아래 본문을 근거로 이 화에서 무슨 일이 일어났는지 2~3문장으로 요약하세요. "
        "줄거리를 아는 사람이 흐름을 되짚을 수 있게 사건 중심으로 쓰고, 키워드 나열이 "
        "아니라 서술문으로 쓰세요. 머리말·따옴표·번호·개행 없이 요약 문장만 출력하세요."
    ),
    TaskType.draft: (
        "아래 요약을 근거로 이 화의 본문을 쓰세요. 요약의 각 사건을 문단으로 펼치고, "
        "요약에 없는 사건을 새로 만들지 마세요. 메모리 컨텍스트의 인물·설정과 모순되지 "
        "않게 쓰세요. 머리말·제목·설명·따옴표 없이 본문만 출력하세요."
    ),
}


def _format_memory_full(items: Sequence[MemoryItemResponse]) -> str:
    """풀세트: P1(엔티티)+P2(타임라인 상태)+P3(벡터 매칭) 전부 직렬화."""
    if not items:
        return "(관련 메모리 없음)"
    lines: list[str] = []
    for item in items:
        if item.type == MemoryItemType.entity:
            lines.append(f"[엔티티] {item.name}: {item.summary}")
        elif item.type == MemoryItemType.timeline_state:
            note = f" ({item.note})" if item.note else ""
            lines.append(f"[상태] {item.state_key}={item.state_value}{note}")
        else:
            lines.append(f"[참고] {item.content}")
    return "\n".join(lines)


def _format_memory_light(items: Sequence[MemoryItemResponse]) -> str:
    """경량: P1(엔티티 핵심 name/summary)만."""
    entities = [item for item in items if item.priority == 1]
    if not entities:
        return "(관련 엔티티 없음)"
    return "\n".join(f"[엔티티] {item.name}: {item.summary}" for item in entities)


def _format_memory_minimal(items: Sequence[MemoryItemResponse]) -> str:
    """최소: 고유명사 보존용 엔티티 name만."""
    names = [item.name for item in items if item.priority == 1 and item.name]
    if not names:
        return "(고유명사 없음)"
    return "고유명사: " + ", ".join(dict.fromkeys(names))


def _format_characters(characters: Sequence[CharacterSpeechProfile]) -> str:
    """지문/대사 변환용 인물 말투 강조 블록."""
    if not characters:
        return "(강조할 인물 없음)"
    lines = []
    for character in characters:
        samples = (
            " / ".join(character.sample_lines) if character.sample_lines else "(예시 대사 없음)"
        )
        lines.append(f"- {character.name}: 말투='{character.speech_style}', 예시 대사: {samples}")
    return "\n".join(lines)


def assemble_prompt(
    task_type: TaskType,
    *,
    work_genre: str,
    work_style: str,
    memory_items: Sequence[MemoryItemResponse],
    task_input: AssistTaskInput,
) -> list[BaseMessage]:
    """작업종류 → (공통 베이스 + 작업별 지시 + 메모리 주입) 조립.

    Parameters
    ----------
    task_type:
        5개 집필 보조 작업 중 하나.
    work_genre, work_style:
        작품의 ``genre``/``style`` (공통 베이스에 삽입).
    memory_items:
        `MemorySearchService.search()`가 반환하는 병합된 메모리 결과(P1~P3).
        주입 수준(풀세트/경량/최소)은 ``task_type``에 따라 이 함수가 필터링한다.
    task_input:
        작업별 사용자 입력. ``task_type``과 짝이 맞는 dataclass가 아니면
        ``TypeError``.

    Returns
    -------
    list[BaseMessage]
        ``[SystemMessage, HumanMessage]`` — ``LLMClient.ainvoke``/``astream``에
        그대로 전달 가능.
    """
    system_parts = [
        _COMMON_BASE.format(genre=work_genre, style=work_style),
        _TASK_INSTRUCTION[task_type],
    ]

    if task_type is TaskType.continue_:
        if not isinstance(task_input, ContinueInput):
            raise TypeError(
                f"continue task requires ContinueInput, got {type(task_input).__name__}"
            )
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_full(memory_items)}")
        user_text = task_input.cursor_text
    elif task_type is TaskType.infill:
        if not isinstance(task_input, InfillInput):
            raise TypeError(f"infill task requires InfillInput, got {type(task_input).__name__}")
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_full(memory_items)}")
        user_text = f"[앞 문장]\n{task_input.before_text}\n\n[뒤 문장]\n{task_input.after_text}"
    elif task_type is TaskType.dialogue:
        if not isinstance(task_input, DialogueInput):
            raise TypeError(
                f"dialogue task requires DialogueInput, got {type(task_input).__name__}"
            )
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_full(memory_items)}")
        system_parts.append(f"[인물 말투 강조]\n{_format_characters(task_input.characters)}")
        user_text = task_input.intent
    elif task_type is TaskType.style:
        if not isinstance(task_input, StyleInput):
            raise TypeError(f"style task requires StyleInput, got {type(task_input).__name__}")
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_light(memory_items)}")
        user_text = f"[대상 텍스트]\n{task_input.text}\n\n[목표 문체]\n{task_input.target_style}"
    elif task_type is TaskType.title_:
        if not isinstance(task_input, TitleInput):
            raise TypeError(f"title task requires TitleInput, got {type(task_input).__name__}")
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_minimal(memory_items)}")
        user_text = task_input.text
    elif task_type is TaskType.summary:
        if not isinstance(task_input, SummaryInput):
            raise TypeError(f"summary task requires SummaryInput, got {type(task_input).__name__}")
        # 요약은 "본문에 무슨 일이 있었나"를 적는 것이라 메모리 주입이 필요 없다 —
        # 근거는 전달된 본문 자체다(eco: 최소 주입).
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_minimal(memory_items)}")
        user_text = task_input.text
    elif task_type is TaskType.draft:
        if not isinstance(task_input, DraftInput):
            raise TypeError(f"draft task requires DraftInput, got {type(task_input).__name__}")
        # 늘려쓰기는 원고를 대신 쓰는 작업이라 **전체 메모리**를 넣는다 — 인물·설정을
        # 모르고 쓰면 이 제품의 전제가 무너진다. `summary`가 최소 주입인 것과 반대다.
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_full(memory_items)}")
        user_text = task_input.text
    else:
        if not isinstance(task_input, CorrectInput):
            raise TypeError(f"correct task requires CorrectInput, got {type(task_input).__name__}")
        system_parts.append(f"[메모리 컨텍스트]\n{_format_memory_minimal(memory_items)}")
        user_text = task_input.text

    return [
        SystemMessage(content="\n\n".join(system_parts)),
        HumanMessage(content=user_text),
    ]
