import { findSceneLocation, groupChaptersByPart } from '@/features/shared/store/selectors';
import type { Scene, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface WorkTreeProps {
  work: Work;
  activeSceneId?: string;
}

export function WorkTree({ work, activeSceneId }: WorkTreeProps) {
  const parts = groupChaptersByPart(work);
  const activeLoc = findSceneLocation(work, activeSceneId);

  // 활성 씬을 포함한 부/화는 펼친 상태로 시작. 활성 씬이 없으면 마지막 부를 펼친다.
  const [openParts, setOpenParts] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (activeLoc) set.add(activeLoc.chapter.partLabel);
    else if (parts.length) set.add(parts[parts.length - 1].part);
    return set;
  });
  const [openChapters, setOpenChapters] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (activeLoc) set.add(activeLoc.chapter.id);
    return set;
  });

  const toggle = (set: Set<string>, key: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    update(next);
  };

  return (
    <div className="flex-1 overflow-y-auto pt-0.5">
      {parts.map(({ part, chapters }) => {
        const partOpen = openParts.has(part);
        return (
          <div key={part}>
            <button
              type="button"
              onClick={() => toggle(openParts, part, setOpenParts)}
              className="mx-1.5 flex h-7 w-[calc(100%-12px)] items-center gap-1.5 rounded-[3px] px-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/[0.04]"
            >
              {partOpen ? (
                <ChevronDown className="size-3.5 text-muted-ink" strokeWidth={2.2} />
              ) : (
                <ChevronRight className="size-3.5 text-faint" strokeWidth={2.2} />
              )}
              <span className="flex-1 truncate">{part}</span>
            </button>

            {partOpen &&
              chapters.map((chapter) => {
                const chapterOpen = openChapters.has(chapter.id);
                return (
                  <div key={chapter.id}>
                    <button
                      type="button"
                      onClick={() => toggle(openChapters, chapter.id, setOpenChapters)}
                      className="mx-1.5 flex h-7 w-[calc(100%-12px)] items-center gap-1.5 rounded-[3px] pr-2.5 pl-5 text-left text-sm text-ink-soft transition-colors hover:bg-ink/[0.04]"
                    >
                      {chapterOpen ? (
                        <ChevronDown className="size-3.5 text-muted-ink" strokeWidth={2.2} />
                      ) : (
                        <ChevronRight className="size-3.5 text-faint" strokeWidth={2.2} />
                      )}
                      <span className="flex-1 truncate">
                        {chapter.index}화 · {chapter.title}
                      </span>
                    </button>

                    {chapterOpen &&
                      chapter.scenes.map((scene) => (
                        <SceneRow
                          key={scene.id}
                          workId={work.id}
                          scene={scene}
                          active={scene.id === activeSceneId}
                        />
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

function SceneRow({
  workId,
  scene,
  active,
}: {
  workId: string;
  scene: Scene;
  active: boolean;
}) {
  return (
    <Link
      to="/works/$workId/write/$sceneId"
      params={{ workId, sceneId: scene.id }}
      className={cn(
        'mx-1.5 flex h-[26px] items-center gap-2 rounded-[3px] pr-2.5 pl-10 text-[13px] transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : scene.status === 'empty'
            ? 'text-faintest hover:bg-ink/[0.04]'
            : 'text-muted-ink hover:bg-ink/[0.04]'
      )}
    >
      <span className="flex-1 truncate">{scene.title}</span>
      {scene.status === 'done' && <Check className="size-3 text-faint" strokeWidth={2.4} />}
    </Link>
  );
}
