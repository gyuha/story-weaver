"""집필 보조 프롬프트 조립 입력 타입 (ai-pipeline.md 3.1 표).

HTTP 요청 스키마가 아니라 ``prompt_assembler`` 내부에서 쓰는 순수 타입이다(dataclass —
외부 입력 검증은 S3의 라우터 스키마가 담당). 작업 종류 자체는
:mod:`domains.assist.tier_routing`\\ 의 ``TaskType``\\ 을 그대로 쓴다(중복 정의 방지).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ContinueInput:
    """이어쓰기: 커서 직전 본문."""

    cursor_text: str


@dataclass(frozen=True)
class InfillInput:
    """인필링: 빈 구간 앞/뒤 문장."""

    before_text: str
    after_text: str


@dataclass(frozen=True)
class CharacterSpeechProfile:
    """지문/대사 변환에서 강조할 인물의 말투(worldbible ``CharacterAttributes`` 발췌)."""

    name: str
    speech_style: str
    sample_lines: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class DialogueInput:
    """지문/대사 변환: 작가의 의도 서술 + 등장 인물 말투."""

    intent: str
    characters: list[CharacterSpeechProfile] = field(default_factory=list)


@dataclass(frozen=True)
class StyleInput:
    """문체 변환: 대상 텍스트 + 목표 문체."""

    text: str
    target_style: str


@dataclass(frozen=True)
class CorrectInput:
    """교정: 대상 텍스트."""

    text: str


#: assemble_prompt의 task_input 파라미터가 받는 5개 작업별 입력 타입의 합집합.
AssistTaskInput = ContinueInput | InfillInput | DialogueInput | StyleInput | CorrectInput
