import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Scene, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { toast } from 'sonner';

const TOOLS = ['이어쓰기', '인필링', '지문→대사', '문체 변환'];

export function Manuscript({
  work,
  chapter,
  scene,
}: {
  work: Work;
  chapter: Chapter;
  scene: Scene;
}) {
  const acceptInline = useWorksStore((s) => s.acceptInlineSuggestion);
  const dismissSuggestion = useWorksStore((s) => s.dismissSuggestion);
  const hasGhost = !!scene.aiSuggestion;

  useEffect(() => {
    if (!hasGhost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptInline(work.id, scene.id);
        toast.success('AI 이어쓰기를 수락했습니다');
      } else if (e.key === 'Escape') {
        dismissSuggestion(work.id, scene.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasGhost, work.id, scene.id, acceptInline, dismissSuggestion]);

  const lastIndex = scene.paragraphs.length - 1;

  return (
    <div className="relative flex-1 overflow-y-auto">
      <div className="px-10 pt-11 pb-28">
        <div className="mb-[11px] text-[12px] font-semibold tracking-[0.04em] text-genre">
          {chapter.partLabel.replace(/^(제\d+부)\s*/, '$1 · ')}
        </div>
        <h1 className="mb-[26px] font-serif text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
          {chapter.title}
        </h1>

        {scene.paragraphs.length === 0 ? (
          <p className="font-serif text-[16.5px] leading-[1.95] text-faintest">
            이 씬은 아직 비어 있습니다. 첫 문장을 쓰거나 아래 도구로 AI에게 이어쓰기를 맡겨 보세요.
          </p>
        ) : (
          <div className="font-serif text-[16.5px] leading-[1.95] text-ink">
            {scene.paragraphs.map((p, i) => {
              const dialogue = p.text.startsWith('「');
              const isLast = i === lastIndex;
              return (
                <p
                  key={`${scene.id}-p${i}`}
                  className={cn('mb-[17px]', dialogue && 'text-ink-soft', isLast && 'mb-1')}
                >
                  {p.text}
                  {isLast && hasGhost && (
                    <>
                      <span className="text-faintest"> {scene.aiSuggestion}</span>
                      <span className="ml-px inline-block h-[19px] w-0.5 -translate-y-[3px] bg-ai align-middle" />
                    </>
                  )}
                </p>
              );
            })}
          </div>
        )}

        {hasGhost && (
          <div className="mt-3.5 inline-flex items-center gap-1 rounded-lg border border-line bg-paper p-[5px_6px_5px_10px] shadow-sm">
            <span className="mr-1 text-[12.5px] font-medium text-muted-ink">AI 이어쓰기</span>
            <button
              type="button"
              onClick={() => {
                acceptInline(work.id, scene.id);
                toast.success('AI 이어쓰기를 수락했습니다');
              }}
              className="flex h-[26px] items-center gap-[5px] rounded-[5px] bg-primary px-2.5 text-[12.5px] font-semibold text-white"
            >
              Tab 수락
            </button>
            <button
              type="button"
              onClick={() => dismissSuggestion(work.id, scene.id)}
              className="px-1.5 text-[12px] text-faintest hover:text-muted-ink"
            >
              Esc
            </button>
          </div>
        )}
      </div>

      {/* 하단 생성 도구 모음 */}
      <div className="pointer-events-auto absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-[3px] rounded-[9px] border border-line bg-paper p-[5px_7px] shadow-md">
        {TOOLS.map((tool, i) => (
          <div key={tool} className="flex items-center">
            {i === 1 && <span className="mx-[3px] h-[18px] w-px bg-[#ececeb]" />}
            <button
              type="button"
              onClick={() => toast(`${tool} — 스트리밍 생성 (목업)`)}
              className={cn(
                'flex h-[30px] items-center gap-1.5 rounded-md px-[11px] text-[13px] transition-colors hover:bg-surface',
                i === 0 ? 'font-medium text-ink-soft' : 'text-muted-ink'
              )}
            >
              {tool}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
