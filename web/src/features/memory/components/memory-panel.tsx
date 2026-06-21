import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Entity, Scene, Work } from '@/features/shared/types';
import { PanelLeft, PanelRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface MemoryPanelProps {
  work: Work;
  chapter: Chapter;
  scene: Scene;
}

/** Smart Editor 우측 메모리 사이드바 — 씬-엔티티 링크 + 벡터 유사도 보조 */
export function MemoryPanel({ work, chapter, scene }: MemoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const entityMap = new Map(work.entities.map((e) => [e.id, e]));
  const linked = scene.linkedEntityIds
    .map((id) => entityMap.get(id))
    .filter((e): e is Entity => !!e);
  const vector = scene.vectorMemory
    .map((v) => ({ entity: entityMap.get(v.entityId), score: v.score }))
    .filter((v): v is { entity: Entity; score: number } => !!v.entity);

  const acceptSuggestion = useWorksStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useWorksStore((s) => s.dismissSuggestion);
  const suggestionEntity = scene.updateSuggestion
    ? entityMap.get(scene.updateSuggestion.entityId)
    : undefined;

  const sceneIndex = chapter.scenes.findIndex((s) => s.id === scene.id) + 1;

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-surface-soft py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="기억 패널 펼치기"
          title="이 씬의 기억 펼치기"
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
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-ink/[0.06] px-3.5">
        <Sparkles className="size-4 text-primary" strokeWidth={2} />
        <span className="flex-1 text-sm font-semibold text-ink">이 씬의 기억</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="기억 패널 접기"
          title="접기"
          className="-mr-1 grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink-soft"
        >
          <PanelRight className="size-[17px]" strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-[15px_14px]">
        <div className="mb-3 text-[12px] leading-[1.4] text-faint">
          씬 {sceneIndex} · {scene.title} — 자동으로 불러온 관련 설정
        </div>

        {linked.length > 0 && (
          <>
            <MemoryGroupLabel left="등장 인물·설정" right="씬-엔티티 링크" />
            <div className="mb-[18px] flex flex-col gap-2">
              {linked.map((e) => (
                <MemoryCard key={e.id} entity={e} badge="링크" badgeTone="link" />
              ))}
            </div>
          </>
        )}

        {vector.length > 0 && (
          <>
            <MemoryGroupLabel left="관련 설정" right="벡터 유사도 · 보조" />
            <div className="mb-[18px] flex flex-col gap-2">
              {vector.map(({ entity, score }) => (
                <MemoryCard
                  key={entity.id}
                  entity={entity}
                  badge={`${score}%`}
                  badgeTone="vector"
                />
              ))}
            </div>
          </>
        )}

        {scene.updateSuggestion && (
          <div className="rounded-lg border border-ai/30 bg-ai-soft p-[12px_13px]">
            <div className="mb-[7px] flex items-center gap-[7px]">
              <Sparkles className="size-3.5 text-ai" strokeWidth={2} />
              <span className="text-[12px] font-semibold text-ai">AI 동적 업데이트 제안</span>
            </div>
            <div className="mb-[11px] text-[12px] leading-[1.55] text-ink-soft">
              <b className="font-semibold text-ink">{suggestionEntity?.name ?? '엔티티'}</b>이{' '}
              {scene.updateSuggestion.body}
            </div>
            <div className="flex gap-[7px]">
              <button
                type="button"
                onClick={() => {
                  acceptSuggestion(work.id, scene.id);
                  toast.success('엔티티 카드에 반영되었습니다');
                }}
                className="h-[30px] flex-1 rounded-[5px] bg-ai text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
              >
                반영
              </button>
              <button
                type="button"
                onClick={() => dismissSuggestion(work.id, scene.id)}
                className="h-[30px] rounded-[5px] border border-line-strong px-[13px] text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
              >
                무시
              </button>
            </div>
          </div>
        )}

        {linked.length === 0 && vector.length === 0 && !scene.updateSuggestion && (
          <div className="rounded-lg border border-dashed border-line-strong p-4 text-center text-[12px] leading-[1.6] text-faint">
            이 씬에 연결된 설정이 아직 없습니다.
            <br />
            인물·장소를 언급하면 자동으로 채워집니다.
          </div>
        )}
      </div>
    </aside>
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
  badge,
  badgeTone,
}: {
  entity: Entity;
  badge: string;
  badgeTone: 'link' | 'vector';
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-[10px_11px]">
      <div className="mb-[5px] flex items-center gap-2">
        <span className="text-[15px] leading-none">{entity.emoji}</span>
        <span className="flex-1 text-[13px] font-semibold text-ink">{entity.name}</span>
        <span
          className={
            badgeTone === 'link'
              ? 'rounded bg-primary/10 px-1.5 py-[3px] text-[10.5px] font-medium text-primary'
              : 'rounded bg-[#fbecdd] px-1.5 py-[3px] text-[10.5px] font-medium text-genre'
          }
        >
          {badge}
        </span>
      </div>
      <div className="text-[11.5px] leading-[1.5] text-muted-ink">{entity.summary}</div>
    </div>
  );
}
