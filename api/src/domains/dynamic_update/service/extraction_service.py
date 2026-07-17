"""화 본문 → 신규 설정 후보 추출 서비스 (plan.md M3-S1).

화의 현재 본문 + 링크된 엔티티 카드(timeline의 ``SceneEntityLink`` → worldbible의
``Entity``)를 LOW_COST 티어 LLM에 넘겨, 아직 엔티티 카드에 반영되지 않은 새 사실을
JSON으로 추출한다. LLM 출력은 신뢰할 수 없으므로(:func:`parse_extraction_result`)
JSON 파싱/스키마 검증 실패 시 예외를 삼키고 빈 결과(3개 카테고리 모두 빈 리스트)를
반환한다 — 요청을 500으로 실패시키지 않는다.

소유권 확인은 manuscript/worldbible/timeline 도메인이 이미 확립한 헬퍼
(``get_chapter_by_id``/``get_entity``/``list_links``)를 그대로 재사용한다(ADR-0005).
"""

from __future__ import annotations

import json
import re
import uuid

from fastapi import status
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from core.exceptions import AppError
from domains.chat.ports import AbstractLLMPort
from domains.dynamic_update.schemas import ExtractUpdatesResponse
from domains.manuscript.service import ManuscriptService
from domains.moderation.service import (
    PRECHECK_DECLINE_MESSAGE,
    RETRY_DECLINE_MESSAGE,
    invoke_with_retry,
    is_explicit_content,
)
from domains.timeline.service import TimelineService
from domains.worldbible.models import Entity
from domains.worldbible.service import WorldBibleService

_SYSTEM_PROMPT = (
    "당신은 웹소설 원고에서 설정 변경을 감지하는 보조 AI입니다. "
    "주어진 씬 본문을 [알려진 엔티티]와 비교해, 아직 카드에 반영되지 않은 새로운 사실만 "
    "추출하세요. 다음 키를 가진 JSON 객체 하나만 출력하세요(다른 텍스트·설명 금지):\n"
    '{"candidateEntities": [{"name": "...", "summary": "..."}], '
    '"attributeChanges": [{"entityId": "...", "attribute": "...", "newValue": "..."}], '
    '"timelineChanges": [{"entityId": "...", "stateKey": "...", "stateValue": "..."}]}\n'
    "candidateEntities는 [알려진 엔티티]에 없는 새 인물/장소/사건/아이템, "
    "attributeChanges는 기존 엔티티의 바뀐 속성(외형·성격 등), "
    "timelineChanges는 사망·이동·소지 등 시점에 묶인 상태 변화(예: life_status=dead)입니다. "
    "entityId는 [알려진 엔티티]에 주어진 id를 그대로 쓰세요. 신규/변경이 없으면 해당 배열은 "
    "빈 배열로 두세요."
)


def _format_entities(entities: list[Entity]) -> str:
    """[알려진 엔티티] 블록 — id/name/summary/attributes를 그대로 나열."""
    if not entities:
        return "(연결된 엔티티 없음)"
    return "\n".join(
        f"- id={entity.id} name={entity.name} summary={entity.summary} "
        f"attributes={entity.attributes}"
        for entity in entities
    )


#: 일부 모델(GLM-4.6 등)은 순수 JSON 대신 마크다운 코드펜스로 감싸 응답한다
#: (예: ` ```json\n{...}\n``` `) — json.loads 전에 펜스를 벗겨낸다.
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL)


def _strip_code_fence(text: str) -> str:
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1) if match else text


def parse_extraction_result(raw_text: str) -> ExtractUpdatesResponse:
    """LLM 응답 텍스트를 방어적으로 파싱 — JSON 파싱/스키마 검증 실패 시 빈 결과."""
    try:
        data = json.loads(_strip_code_fence(raw_text))
        return ExtractUpdatesResponse.model_validate(data)
    except (json.JSONDecodeError, ValidationError, TypeError):
        return ExtractUpdatesResponse()


class DynamicUpdateService:
    def __init__(
        self,
        manuscript_service: ManuscriptService,
        worldbible_service: WorldBibleService,
        timeline_service: TimelineService,
    ) -> None:
        self._manuscript_service = manuscript_service
        self._worldbible_service = worldbible_service
        self._timeline_service = timeline_service

    async def extract_updates(
        self,
        work_id: uuid.UUID,
        user_id: uuid.UUID,
        chapter_id: uuid.UUID,
        llm: AbstractLLMPort,
    ) -> ExtractUpdatesResponse:
        chapter = await self._manuscript_service.get_chapter_by_id(work_id, user_id, chapter_id)
        # S1 선제 가드(plan.md M4-S1) — 화 본문이 명백히 19금 수위면 LLM 호출 자체를 생략.
        if is_explicit_content(chapter.body):
            raise AppError(PRECHECK_DECLINE_MESSAGE, status.HTTP_400_BAD_REQUEST)

        links = await self._timeline_service.list_links(work_id, user_id, chapter_id)
        entities = [
            await self._worldbible_service.get_entity(work_id, user_id, link.entity_id)
            for link in links
        ]
        known_entities = _format_entities(entities)
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=f"[씬 본문]\n{chapter.body}\n\n[알려진 엔티티]\n{known_entities}"),
        ]
        # S2 완화 재시도(plan.md M4-S2) — 거절/빈 응답이면 완화 프롬프트로 1회
        # 재시도하고, 그래도 실패하면 raw 에러 없이 완곡 안내로 대체한다.
        outcome = await invoke_with_retry(llm, messages)
        if outcome.declined:
            raise AppError(RETRY_DECLINE_MESSAGE, status.HTTP_400_BAD_REQUEST)
        return parse_extraction_result(outcome.chunks[0])
