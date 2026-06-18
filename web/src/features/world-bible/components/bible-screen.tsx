import { WorkShell } from '@/components/layout/work-shell';
import type { Work } from '@/features/shared/types';
import { EntityDetail } from './entity-detail';
import { EntityList } from './entity-list';

export function BibleScreen({
  work,
  selectedEntityId,
}: {
  work: Work;
  selectedEntityId?: string;
}) {
  const selected = work.entities.find((e) => e.id === selectedEntityId) ?? work.entities[0];

  return (
    <WorkShell work={work} active="bible">
      <div className="flex h-full min-w-0">
        <EntityList work={work} selectedId={selected?.id} />
        {selected ? (
          <EntityDetail work={work} entity={selected} />
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-ink">
            아직 등록된 엔티티가 없습니다. 새 엔티티를 추가해 World Bible을 시작하세요.
          </div>
        )}
      </div>
    </WorkShell>
  );
}
