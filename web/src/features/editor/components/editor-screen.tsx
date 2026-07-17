import { WorkShell } from '@/components/layout/work-shell';
import { MemoryPanel } from '@/features/memory/components/memory-panel';
import type { Chapter, Work } from '@/features/shared/types';
import { ManuscriptEditor } from './manuscript';

interface EditorScreenProps {
  work: Work;
  chapter: Chapter;
}

export function EditorScreen({ work, chapter }: EditorScreenProps) {
  return (
    <WorkShell work={work} active="write" activeChapterId={chapter.id}>
      <div className="flex min-h-0 flex-1">
        {/* 화가 바뀌면 에디터를 새로 마운트해 본문을 다시 채운다 (편집은 ephemeral) */}
        <ManuscriptEditor key={chapter.id} work={work} chapter={chapter} />
        <MemoryPanel work={work} chapter={chapter} />
      </div>
    </WorkShell>
  );
}
