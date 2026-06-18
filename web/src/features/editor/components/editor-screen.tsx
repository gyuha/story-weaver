import { WorkShell } from '@/components/layout/work-shell';
import { MemoryPanel } from '@/features/memory/components/memory-panel';
import { useWorkspaceMeta } from '@/features/shared/store/selectors';
import type { Chapter, Scene, Work } from '@/features/shared/types';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { Manuscript } from './manuscript';

interface EditorScreenProps {
  work: Work;
  chapter: Chapter;
  scene: Scene;
}

export function EditorScreen({ work, chapter, scene }: EditorScreenProps) {
  const { authorInitial } = useWorkspaceMeta();

  return (
    <WorkShell work={work} active="write" activeSceneId={scene.id}>
      <div className="flex h-full flex-col">
        {/* topbar */}
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-ink/[0.06] px-4">
          <div className="flex min-w-0 flex-1 items-center gap-[7px] text-[13.5px] text-muted-ink">
            <span className="truncate">{chapter.partLabel}</span>
            <ChevronRight className="size-3 shrink-0 text-line-strong" strokeWidth={2} />
            <span className="truncate font-medium text-ink">
              {chapter.index}화 · {chapter.title}
            </span>
          </div>
          <span className="mr-0.5 flex items-center gap-[5px] text-[12px] text-faint">
            <Check className="size-3 text-success" strokeWidth={2.4} />
            저장됨
          </span>
          <span className="flex h-7 items-center rounded-[5px] border border-line px-[11px] text-[12.5px] font-medium text-ink-soft">
            고품질 모델
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-[5px] bg-ai/10 px-3 text-[13px] font-semibold text-ai">
            <Sparkles className="size-[15px]" strokeWidth={2} />
            AI
          </span>
          <div className="ml-0.5 grid size-[29px] place-items-center rounded-full bg-[#cf8a4b] text-[12px] font-semibold text-white">
            {authorInitial}
          </div>
        </div>

        {/* manuscript + memory */}
        <div className="flex min-h-0 flex-1">
          <Manuscript work={work} chapter={chapter} scene={scene} />
          <MemoryPanel work={work} chapter={chapter} scene={scene} />
        </div>
      </div>
    </WorkShell>
  );
}
