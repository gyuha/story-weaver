import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { chatMutations, chatQueries, useChatStream } from '@/features/memory/api/chat.api';
import { memoryApi } from '@/features/memory/api/memory.api';
import { useWorksStore } from '@/features/shared/store/works.store';
import type {
  Chapter,
  Entity,
  MemoryReason,
  UpdateSuggestion,
  Work,
} from '@/features/shared/types';
import { EntityDetail } from '@/features/world-bible/components/entity-detail';
import { cn } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface MemoryPanelProps {
  work: Work;
  chapter: Chapter;
}

type PanelTab = 'settings' | 'chat';

/** Smart Editor 우측 패널 — 설정 참고(메모리) 탭 + 채팅(질의) 탭 */
export function MemoryPanel({ work, chapter }: MemoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<PanelTab>('settings');

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-surface-soft py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="패널 펼치기"
          title="패널 펼치기"
          className="grid size-8 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink-soft"
        >
          <PanelLeft className="size-[17px]" strokeWidth={2} />
        </button>
        <Sparkles className="size-4 text-primary" strokeWidth={2} />
      </aside>
    );
  }

  return (
    <aside className="flex w-[316px] shrink-0 flex-col border-l border-line bg-surface-soft">
      <div className="flex h-[46px] shrink-0 items-center gap-1 border-b border-ink/[0.06] px-2.5">
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={Sparkles}>
          설정 참고
        </TabButton>
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessageSquare}>
          채팅
        </TabButton>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="패널 접기"
          title="접기"
          className="ml-auto grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink-soft"
        >
          <PanelRight className="size-[17px]" strokeWidth={2} />
        </button>
      </div>

      {tab === 'settings' ? (
        <SettingsTab work={work} chapter={chapter} />
      ) : (
        <ChatTab work={work} chapterId={chapter.id} />
      )}
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
        active ? 'bg-surface text-ink' : 'text-faint hover:bg-surface/60 hover:text-ink-soft'
      )}
    >
      <Icon className={cn('size-3.5', active && 'text-primary')} strokeWidth={2} />
      {children}
    </button>
  );
}

/** 설정 참고 탭 — 화-엔티티 링크 + 벡터 유사도 보조 + AI 동적 제안 (기존 메모리 패널) */
function SettingsTab({ work, chapter }: MemoryPanelProps) {
  const entityMap = new Map(work.entities.map((e) => [e.id, e]));

  const acceptSuggestion = useWorksStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useWorksStore((s) => s.dismissSuggestion);
  const removeLink = useWorksStore((s) => s.removeChapterEntityLink);

  const [addOpen, setAddOpen] = useState(false);
  const [detailEntity, setDetailEntity] = useState<Entity | null>(null);
  // 자동 추천(벡터) 항목을 세션 내에서 제외 (영속화 없음 — 실 구현 시 dismiss 영속화 필요)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // "AI 추천 받기"로 실 메모리 API에서 받아 추가한 추천 (ephemeral, 자동 출처로 표시)
  // reason: 'link'=1차(entity/timeline_state, 링크 근거) · 'vector'=보조(벡터 매칭)
  const [manualRecs, setManualRecs] = useState<{ entityId: string; reason: MemoryReason }[]>([]);
  const [recommending, setRecommending] = useState(false);

  // 표시 통합: 엔티티 1개당 카드 1개, 출처(수동/자동)는 모두 배지로. 데이터는 분리 보존(ADR-0002).
  // 자동 후보 = 벡터 시드(스코어 배지) + AI 추천(1차/보조 배지)
  type AutoBadge = { label: string; tone: MemoryReason };
  const autoPool: { entityId: string; badge: AutoBadge }[] = [
    ...chapter.vectorMemory.map((v) => ({
      entityId: v.entityId,
      badge: { label: `추천 ${v.score}%`, tone: 'vector' as const },
    })),
    ...manualRecs.map((v) => ({
      entityId: v.entityId,
      badge:
        v.reason === 'vector'
          ? { label: '추천', tone: 'vector' as const }
          : { label: '링크', tone: 'link' as const },
    })),
  ];
  const autoBadges = new Map(autoPool.map((v) => [v.entityId, v.badge]));
  const items: { entity: Entity; manual: boolean; autoBadge?: AutoBadge }[] = [];
  const seen = new Set<string>();
  for (const id of chapter.linkedEntityIds) {
    const entity = entityMap.get(id);
    if (!entity || seen.has(id)) continue;
    seen.add(id);
    items.push({ entity, manual: true, autoBadge: autoBadges.get(id) });
  }
  // 자동 전용(추천이지만 수동 링크 아님)은 도착 순서(백엔드 priority 순), 세션 제외분 제거
  for (const v of autoPool) {
    const entity = entityMap.get(v.entityId);
    if (!entity || seen.has(v.entityId) || dismissed.has(v.entityId)) continue;
    seen.add(v.entityId);
    items.push({ entity, manual: false, autoBadge: v.badge });
  }

  // 완전 제거: 수동분은 링크 해제(실 API), 자동분은 세션 dismiss — 둘 다면 둘 다 수행
  const removeItem = (item: { entity: Entity; manual: boolean; autoBadge?: AutoBadge }) => {
    if (item.autoBadge != null) setDismissed((s) => new Set(s).add(item.entity.id));
    if (item.manual) {
      removeLink(work.id, chapter.id, item.entity.id)
        .then(() => toast.success(`'${item.entity.name}' 참고를 제거했습니다`))
        .catch((err) => toast.error(apiErrorMessage(err, '참고를 제거하지 못했습니다')));
    } else {
      toast.success(`'${item.entity.name}' 참고를 제거했습니다`);
    }
  };

  // AI 추천 받기: 실 메모리 검색 API(링크 엔티티+타임라인 상태+벡터 매칭) 호출 후
  // type=entity/timeline_state는 1차(링크 배지), type=vector_match는 보조(추천 배지)로 추가한다.
  const handleRecommend = async () => {
    setRecommending(true);
    try {
      const results = await memoryApi.search({
        path: { work_id: work.id, chapter_id: chapter.id },
      });
      const excluded = new Set<string>([
        ...chapter.linkedEntityIds,
        ...autoPool.map((v) => v.entityId),
        ...dismissed,
      ]);
      const seenNew = new Set<string>();
      const recs: { entityId: string; reason: MemoryReason }[] = [];
      for (const result of results) {
        const entityId = result.entityId;
        if (!entityId || excluded.has(entityId) || seenNew.has(entityId)) continue;
        seenNew.add(entityId);
        recs.push({ entityId, reason: result.type === 'vector_match' ? 'vector' : 'link' });
      }
      if (recs.length === 0) {
        toast('추천할 설정이 없습니다');
        return;
      }
      setManualRecs((prev) => [...prev, ...recs]);
      toast.success(`AI 추천 ${recs.length}개를 추가했습니다`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'AI 추천을 가져오지 못했습니다'));
    } finally {
      setRecommending(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-[15px_14px]">
      <div className="mb-3 text-[12px] leading-[1.4] text-faint">
        {chapter.index}화 · {chapter.title} — 집필에 참고할 설정
      </div>

      <MemoryGroupLabel left="설정 참고" right="수동 + 자동 추천" />
      <div className="mt-[9px] mb-2.5 flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.entity.id} className="group relative">
            <MemoryCard
              entity={item.entity}
              badges={[
                ...(item.manual ? [{ label: '링크', tone: 'link' as const }] : []),
                // 링크 배지와 중복되는 1차(link 톤) 자동 배지는 건너뛴다
                ...(item.autoBadge && !(item.manual && item.autoBadge.tone === 'link')
                  ? [item.autoBadge]
                  : []),
              ]}
              onClick={() => setDetailEntity(item.entity)}
            />
            <button
              type="button"
              aria-label={`${item.entity.name} 참고 제거`}
              title="참고 제거"
              onClick={() => removeItem(item)}
              className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded text-faint opacity-0 transition-opacity hover:bg-[#fdebec] hover:text-[#c4554d] group-hover:opacity-100"
            >
              <X className="size-3.5" strokeWidth={2.4} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-4 text-center text-[12px] leading-[1.6] text-faint">
            아직 참고 설정이 없습니다.
            <br />
            아래 "설정 참고 추가"로 넣어 보세요.
          </div>
        )}
      </div>
      <div className="mb-[18px] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-[12.5px] font-medium text-muted-ink transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          설정 참고 추가
        </button>
        <button
          type="button"
          onClick={handleRecommend}
          disabled={recommending}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-ai/40 bg-ai/[0.06] text-[12.5px] font-medium text-ai transition-colors hover:bg-ai/[0.12] disabled:opacity-50"
        >
          <Sparkles className="size-3.5" strokeWidth={2} />
          {recommending ? 'AI 추천 가져오는 중…' : 'AI 추천 받기'}
        </button>
      </div>

      {chapter.pendingSuggestions && chapter.pendingSuggestions.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {chapter.pendingSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="rounded-lg border border-ai/30 bg-ai-soft p-[12px_13px]"
            >
              <div className="mb-[7px] flex items-center gap-[7px]">
                <Sparkles className="size-3.5 text-ai" strokeWidth={2} />
                <span className="text-[12px] font-semibold text-ai">AI 동적 업데이트 제안</span>
              </div>
              <div className="mb-[11px] text-[12px] leading-[1.55] text-ink-soft">
                {describeSuggestion(suggestion, entityMap)}
              </div>
              <div className="flex gap-[7px]">
                <button
                  type="button"
                  onClick={() => {
                    acceptSuggestion(work.id, chapter.id, suggestion.id)
                      .then(() => toast.success('엔티티 카드에 반영되었습니다'))
                      .catch((err) => toast.error(apiErrorMessage(err, '반영하지 못했습니다')));
                  }}
                  className="h-[30px] flex-1 rounded-[5px] bg-ai text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
                >
                  반영
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dismissSuggestion(work.id, chapter.id, suggestion.id).catch((err) =>
                      toast.error(apiErrorMessage(err, '처리하지 못했습니다'))
                    )
                  }
                  className="h-[30px] rounded-[5px] border border-line-strong px-[13px] text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
                >
                  무시
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddReferenceModal work={work} chapter={chapter} onClose={() => setAddOpen(false)} />
      )}
      {detailEntity && (
        <DetailModal work={work} entity={detailEntity} onClose={() => setDetailEntity(null)} />
      )}
    </div>
  );
}

/** 제안 kind별 payload를 사람이 읽을 문장으로 조립한다. attribute_change/timeline_state는
 * entityId로 기존 엔티티 이름을 찾아 보여준다(백엔드가 확정 id만 주므로 이름 매칭 불필요). */
function describeSuggestion(suggestion: UpdateSuggestion, entityMap: Map<string, Entity>) {
  switch (suggestion.kind) {
    case 'new_entity':
      return (
        <>
          신규 엔티티 후보 <b className="font-semibold text-ink">{suggestion.payload.name}</b>
          {suggestion.payload.summary ? ` — ${suggestion.payload.summary}` : ''}
        </>
      );
    case 'attribute_change': {
      const name = entityMap.get(suggestion.payload.entityId)?.name ?? '엔티티';
      return (
        <>
          <b className="font-semibold text-ink">{name}</b>의 {suggestion.payload.attribute}이(가) '
          {suggestion.payload.newValue}'로 바뀔 수 있습니다
        </>
      );
    }
    case 'timeline_state': {
      const name = entityMap.get(suggestion.payload.entityId)?.name ?? '엔티티';
      return (
        <>
          <b className="font-semibold text-ink">{name}</b>의 {suggestion.payload.stateKey}이(가) '
          {suggestion.payload.stateValue}'로 바뀔 수 있습니다
        </>
      );
    }
  }
}

/** 설정 참고 추가 모달 — 검색 + 미링크 엔티티 체크박스 다중선택 → 일괄 추가 */
function AddReferenceModal({
  work,
  chapter,
  onClose,
}: {
  work: Work;
  chapter: Chapter;
  onClose: () => void;
}) {
  const addLinks = useWorksStore((s) => s.addChapterEntityLinks);
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // 이미 링크된 엔티티는 목록에서 제외 (추가 전용)
  const candidates = work.entities.filter((e) => !chapter.linkedEntityIds.includes(e.id));
  const term = q.trim().toLowerCase();
  const filtered = term
    ? candidates.filter((e) =>
        [e.name, e.alias, e.summary]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(term))
      )
    : candidates;

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const apply = () => {
    if (checked.size) {
      addLinks(work.id, chapter.id, [...checked]).catch((err) => {
        toast.error(apiErrorMessage(err, '설정 참고 추가에 실패했습니다'));
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative flex h-[70vh] w-[480px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <span className="flex-1 text-sm font-semibold text-ink">설정 참고 추가</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-8 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink-soft"
          >
            <X className="size-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="shrink-0 px-4 py-3">
          <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface-soft px-2.5 focus-within:border-primary">
            <Search className="size-4 shrink-0 text-faint" strokeWidth={2} />
            <input
              // biome-ignore lint/a11y/noAutofocus: 모달 열리면 바로 검색하도록 의도된 포커스
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름·별칭·설명으로 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faintest"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {filtered.length === 0 ? (
            <div className="mt-6 text-center text-[12.5px] text-faint">
              {candidates.length === 0 ? '추가할 설정이 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          ) : (
            filtered.map((e) => {
              const on = checked.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggle(e.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface"
                >
                  <span
                    className={cn(
                      'grid size-[18px] shrink-0 place-items-center rounded border',
                      on ? 'border-primary bg-primary text-white' : 'border-line-strong'
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="text-[15px] leading-none">{e.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {e.name}
                    </span>
                    {e.alias && (
                      <span className="block truncate text-[11.5px] text-faint">{e.alias}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted-ink">
                    {e.type}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-line px-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-line-strong px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            취소
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={checked.size === 0}
            className="h-9 rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            추가{checked.size > 0 ? ` (${checked.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 설정 상세 모달 — 기존 EntityDetail 재사용 */
function DetailModal({
  work,
  entity,
  onClose,
}: { work: Work; entity: Entity; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative flex h-[82vh] w-[680px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink-soft"
        >
          <X className="size-[18px]" strokeWidth={2} />
        </button>
        <div className="flex min-h-0 flex-1 flex-col">
          <EntityDetail work={work} entity={entity} />
        </div>
      </div>
    </div>
  );
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

/** 채팅 탭 — 작품 단위 대화(ADR-0010). 화를 옮겨도 이어지고, 매 메시지마다 현재 화
 * 원고+메모리로 프레시 컨텍스트가 조립되어 스트리밍 응답한다. */
function ChatTab({ work, chapterId }: { work: Work; chapterId: string }) {
  const historyQuery = useQuery(chatQueries.messages({ path: { work_id: work.id } }));
  // eco: 응답 데이터는 렌더에 쓰지 않는다 — "새 대화" 버튼을 그 사이 누르지 못하도록
  // isPending만 참고한다(현재 대화 id 자체는 서버가 알아서 최신 것으로 처리).
  const conversationQuery = useQuery(chatQueries.conversation({ path: { work_id: work.id } }));
  const startNewConversation = useMutation(chatMutations.startNewConversation());
  const chatStream = useChatStream();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  // 바닥 근처면 새 메시지에 자동으로 따라 내려가고, 위로 스크롤하면 그 위치를 유지
  const stick = useRef(true);
  // 진행 중인 스트림 응답을 이미 messages에 편입했는지 추적 (start() 호출 시 false로 리셋)
  const committedRef = useRef(true);

  useEffect(() => {
    if (historyQuery.data) {
      setMessages(
        historyQuery.data.map((m) => ({
          role: m.role === 'assistant' ? 'ai' : 'user',
          text: m.content,
        }))
      );
    }
  }, [historyQuery.data]);

  useEffect(() => {
    if (chatStream.error) {
      toast.error(apiErrorMessage(chatStream.error, '메시지를 보내지 못했습니다'));
    }
  }, [chatStream.error]);

  // 스트림이 끝나면 완성된 응답을 말풍선 목록에 편입한다.
  useEffect(() => {
    if (!chatStream.isStreaming && !committedRef.current && chatStream.text) {
      setMessages((m) => [...m, { role: 'ai', text: chatStream.text }]);
      committedRef.current = true;
    }
  }, [chatStream.isStreaming, chatStream.text]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 메시지·스트리밍 텍스트 변경 시에만 바닥 고정 판단
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, chatStream.text]);

  const send = () => {
    const text = input.trim();
    if (!text || chatStream.isStreaming) return;
    stick.current = true; // 내가 보낸 직후엔 바닥으로
    committedRef.current = false;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    chatStream.start({ workId: work.id, payload: { content: text, chapterId } });
  };

  const newConversation = () => {
    startNewConversation.mutate(
      { path: { work_id: work.id } },
      {
        // eco: 새 대화는 항상 빈 이력이므로 재조회 대신 로컬 목록만 비운다.
        onSuccess: () => setMessages([]),
        onError: (err) => toast.error(apiErrorMessage(err, '새 대화를 시작하지 못했습니다')),
      }
    );
  };

  const disabled = chatStream.isStreaming;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="flex h-9 shrink-0 items-center justify-end border-b border-ink/[0.06] px-2">
        <button
          type="button"
          onClick={newConversation}
          disabled={disabled || startNewConversation.isPending || conversationQuery.isPending}
          className="flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-faint transition-colors hover:bg-surface hover:text-ink-soft disabled:opacity-50"
        >
          <Plus className="size-3" strokeWidth={2} />새 대화
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-[15px_14px]">
        {messages.length === 0 && !chatStream.isStreaming ? (
          <div className="mt-6 text-center text-[12.5px] leading-[1.7] text-faint">
            집필 중인 작품에 대해 질문해 보세요.
            <br />
            설정·전개·문장 등 무엇이든 좋아요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <ChatBubble
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only 목록이라 인덱스로 충분
                key={i}
                sender={m.role}
                text={m.text}
              />
            ))}
            {chatStream.isStreaming && <ChatBubble sender="ai" text={chatStream.text} />}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-ink/[0.06] p-2.5">
        <div className="flex items-end gap-1.5 rounded-[10px] border border-line bg-paper px-2.5 py-1.5 focus-within:border-primary">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={disabled}
            rows={1}
            placeholder="메시지를 입력하세요…"
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-ink outline-none placeholder:text-faintest disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={disabled || !input.trim()}
            aria-label="전송"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Send className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

// AI 응답만 마크다운으로 렌더링(사용자 입력은 원문 그대로 표시).
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-1.5 list-disc pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-1.5 list-decimal pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
};

function ChatBubble({ sender, text }: { sender: 'user' | 'ai'; text: string }) {
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-[10px] px-3 py-2 text-[13px] leading-[1.6]',
        sender === 'user'
          ? 'self-end bg-primary/10 text-ink'
          : 'self-start border border-line bg-paper text-ink-soft'
      )}
    >
      {sender === 'ai' ? (
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
      ) : (
        text
      )}
    </div>
  );
}

function MemoryGroupLabel({ left, right }: { left: string; right: string }) {
  return (
    <div className="mb-[9px] flex items-center justify-between">
      <span className="text-[11.5px] font-semibold text-muted-ink">{left}</span>
      <span className="text-[11px] text-faintest">{right}</span>
    </div>
  );
}

function MemoryCard({
  entity,
  badges,
  onClick,
}: {
  entity: Entity;
  badges: { label: string; tone: 'link' | 'vector' }[];
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-line bg-paper p-[10px_11px] text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
    >
      <div className="mb-[5px] flex items-center gap-2">
        <span className="text-[15px] leading-none">{entity.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
          {entity.name}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {badges.map((b) => (
            <span
              key={b.label}
              className={
                b.tone === 'link'
                  ? 'rounded bg-primary/10 px-1.5 py-[3px] text-[10.5px] font-medium text-primary'
                  : 'rounded bg-[#fbecdd] px-1.5 py-[3px] text-[10.5px] font-medium text-genre'
              }
            >
              {b.label}
            </span>
          ))}
        </span>
      </div>
      <div className="text-[11.5px] leading-[1.5] text-muted-ink">{entity.summary}</div>
    </button>
  );
}
