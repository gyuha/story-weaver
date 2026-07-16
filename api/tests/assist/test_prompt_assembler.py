"""prompt_assembler.assemble_prompt 조립 결과 검증 (TDD, plan.md M3-S1).

ai-pipeline.md 3.1 표의 5개 작업 각각이 (a) 공통 베이스(수위 준수 문구)와
(b) 작업별 메모리 주입 수준(풀세트/경량/최소)을 정확히 반영하는지 확인한다.
실 LLM 호출 없음 — 순수 함수 단위 테스트.
"""

from __future__ import annotations

import uuid

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from domains.assist.schemas import (
    CharacterSpeechProfile,
    ContinueInput,
    CorrectInput,
    DialogueInput,
    InfillInput,
    StyleInput,
    TitleInput,
)
from domains.assist.service.prompt_assembler import assemble_prompt
from domains.assist.tier_routing import TaskType
from domains.memory.schemas import MemoryItemResponse, MemoryItemType

_ENTITY_ID = uuid.uuid4()

_MEMORY_ITEMS = [
    MemoryItemResponse(
        type=MemoryItemType.entity,
        priority=1,
        entity_id=_ENTITY_ID,
        name="한지원",
        summary="주인공, 몰락한 검가의 후예",
    ),
    MemoryItemResponse(
        type=MemoryItemType.timeline_state,
        priority=2,
        entity_id=_ENTITY_ID,
        state_key="life_status",
        state_value="alive",
        note="3장 시점 생존",
    ),
    MemoryItemResponse(
        type=MemoryItemType.vector_match,
        priority=3,
        content="지원은 과거 스승과의 대화에서 검술의 이치를 배웠다.",
    ),
]

_RATING_PHRASE = "전체이용가"


def _combined_text(messages: list[SystemMessage | HumanMessage]) -> str:
    return "\n".join(str(m.content) for m in messages)


def test_continue_prompt_has_full_memory_and_rating_guard() -> None:
    messages = assemble_prompt(
        TaskType.continue_,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=ContinueInput(cursor_text="지원은 검을 뽑아 들었다."),
    )

    assert isinstance(messages[0], SystemMessage)
    assert isinstance(messages[1], HumanMessage)
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    assert "지원은 검을 뽑아 들었다." in text
    # 풀세트: P1(엔티티) + P2(타임라인 상태) + P3(벡터 매칭) 전부 포함
    assert "한지원" in text
    assert "life_status" in text
    assert "지원은 과거 스승과의 대화" in text


def test_infill_prompt_has_full_memory_and_before_after() -> None:
    messages = assemble_prompt(
        TaskType.infill,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=InfillInput(before_text="지원은 검을 뽑았다.", after_text="적은 물러섰다."),
    )
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    assert "지원은 검을 뽑았다." in text
    assert "적은 물러섰다." in text
    assert "한지원" in text
    assert "life_status" in text
    assert "지원은 과거 스승과의 대화" in text


def test_dialogue_prompt_emphasizes_speech_style_and_sample_lines() -> None:
    messages = assemble_prompt(
        TaskType.dialogue,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=DialogueInput(
            intent="지원이 상대의 제안을 화내며 거절한다",
            characters=[
                CharacterSpeechProfile(
                    name="한지원",
                    speech_style="냉소적이고 짧게 끊어 말한다",
                    sample_lines=["됐고.", "네가 뭘 안다고."],
                )
            ],
        ),
    )
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    assert "지원이 상대의 제안을 화내며 거절한다" in text
    # 인물 말투 강조: speech_style + sample_lines
    assert "냉소적이고 짧게 끊어 말한다" in text
    assert "네가 뭘 안다고." in text
    # 풀세트 메모리도 함께 포함
    assert "한지원" in text
    assert "life_status" in text
    assert "지원은 과거 스승과의 대화" in text


def test_style_prompt_uses_light_memory_only() -> None:
    messages = assemble_prompt(
        TaskType.style,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=StyleInput(text="지원은 검을 뽑았다.", target_style="판타지풍"),
    )
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    assert "지원은 검을 뽑았다." in text
    assert "판타지풍" in text
    # 경량: P1(엔티티 핵심)만 — P2/P3는 빠져야 한다
    assert "한지원" in text
    assert "life_status" not in text
    assert "지원은 과거 스승과의 대화" not in text


def test_correct_prompt_uses_minimal_memory_names_only() -> None:
    messages = assemble_prompt(
        TaskType.correct,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=CorrectInput(text="지원은 검울 뽑았다."),
    )
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    assert "지원은 검울 뽑았다." in text
    # 최소: 고유명사(name)만 — summary/상태/벡터는 전부 빠져야 한다
    assert "한지원" in text
    assert "몰락한 검가의 후예" not in text
    assert "life_status" not in text
    assert "지원은 과거 스승과의 대화" not in text


def test_title_prompt_uses_body_and_minimal_memory_names_only() -> None:
    messages = assemble_prompt(
        TaskType.title_,
        work_genre="무협",
        work_style="간결체",
        memory_items=_MEMORY_ITEMS,
        task_input=TitleInput(text="비 오는 골목에서 그는 검을 들었다."),
    )
    text = _combined_text(messages)

    assert _RATING_PHRASE in text
    # 본문이 사용자 메시지에 그대로 담긴다(제목 생성의 근거)
    assert "비 오는 골목에서 그는 검을 들었다." in text
    # 제목 지시: 짧은 제목 하나만, 개행/따옴표 없이
    assert "제목" in text
    assert "개행" in text
    # 최소: 고유명사(name)만 — summary/상태/벡터는 전부 빠져야 한다(correct와 동일)
    assert "한지원" in text
    assert "몰락한 검가의 후예" not in text
    assert "life_status" not in text
    assert "지원은 과거 스승과의 대화" not in text


def test_task_input_mismatch_raises_type_error() -> None:
    with pytest.raises(TypeError):
        assemble_prompt(
            TaskType.continue_,
            work_genre="무협",
            work_style="간결체",
            memory_items=_MEMORY_ITEMS,
            task_input=CorrectInput(text="타입이 안 맞는 입력"),
        )
