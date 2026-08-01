"""작품 단위 채팅 프레시 컨텍스트 조립 (work-chat-context S2, ADR-0010).

매 메시지마다 "현재 화(챕터) 원고 전문 + 메모리 검색 결과"로 시스템 프롬프트
텍스트를 새로 조립한다 — ``Conversation.system_prompt``에 고정하거나 DB 메시지로
영속화하지 않는다(ADR-0010). 호출자(chat_router.py)가 이 텍스트를 매 LLM 호출
직전에만 임시 ``SystemMessage``로 감싸 쓴다.

메모리 렌더링은 assist 도메인의 ``prompt_assembler._format_memory_full``과 동일한
포맷(P1 엔티티/P2 타임라인 상태/P3 벡터 매칭 전부 직렬화)을 미러링한다 — 채팅은
이어쓰기와 달리 경량화가 필요 없는 분석적 질의응답이라 풀세트 그대로 쓴다.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from domains.manuscript.service import ManuscriptService
from domains.memory.schemas import MemoryItemResponse, MemoryItemType
from domains.memory.service.memory_search_service import MemorySearchService
from domains.works.service import WorksService


def _format_memory(items: Sequence[MemoryItemResponse]) -> str:
    """assist 도메인 prompt_assembler._format_memory_full과 동일한 포맷(풀세트)."""
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


class ChatContextService:
    def __init__(
        self,
        manuscript_service: ManuscriptService,
        memory_search_service: MemorySearchService,
        works_service: WorksService,
    ) -> None:
        self._manuscript_service = manuscript_service
        self._memory_search_service = memory_search_service
        self._works_service = works_service

    async def build_context(
        self, work_id: uuid.UUID, user_id: uuid.UUID, chapter_id: uuid.UUID
    ) -> str:
        """현재 화 원고 전문 + 메모리 검색 결과로 프레시 시스템 프롬프트 텍스트를 조립한다.

        범위는 "현재 화(챕터) 전체"로 제한한다(ADR-0010) — 작품 전체 원고는 넣지 않는다.
        """
        work = await self._works_service.get_work(work_id, user_id)  # 소유권 확인 (미소유 시 404)
        chapter = await self._manuscript_service.get_chapter_by_id(work_id, user_id, chapter_id)
        manuscript_text = chapter.body or "(현재 화 본문 없음)"
        memory_items = await self._memory_search_service.search(work_id, user_id, chapter_id)

        return (
            "당신은 웹소설 작가의 집필을 보조하는 AI 어시스턴트입니다. "
            f"이 작품의 장르는 '{work.genre}', 문체는 '{work.style}'입니다.\n"
            "아래는 작가가 현재 쓰고 있는 화(챕터)의 원고 전문과 관련 설정(메모리)입니다. "
            "이를 근거로 작가의 질문에 답하거나 대화하세요.\n\n"
            f"[현재 화 원고]\n{manuscript_text}\n\n"
            f"[메모리 컨텍스트]\n{_format_memory(memory_items)}"
        )
