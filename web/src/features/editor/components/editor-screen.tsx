import { WorkShell } from '@/components/layout/work-shell';
import { MemoryPanel } from '@/features/memory/components/memory-panel';
import type { Chapter, Scene, Work } from '@/features/shared/types';
import { ManuscriptEditor } from './manuscript';

interface EditorScreenProps {
  work: Work;
  chapter: Chapter;
  scene: Scene;
}

export function EditorScreen({ work, chapter, scene }: EditorScreenProps) {
  return (
    <WorkShell work={work} active="write" activeSceneId={scene.id}>
      <div className="flex min-h-0 flex-1">
        {/* 씬이 바뀌면 에디터를 새로 마운트해 본문을 다시 채운다 (편집은 ephemeral) */}
        <ManuscriptEditor key={scene.id} work={work} chapter={chapter} scene={scene} />
        <MemoryPanel work={work} chapter={chapter} scene={scene} />
      </div>
    </WorkShell>
  );
}
