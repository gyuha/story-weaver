import { WorkShell } from '@/components/layout/work-shell';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { EntityForm } from './entity-form';

export function NewEntityScreen({ work }: { work: Work }) {
  const navigate = useNavigate();
  const addEntity = useWorksStore((s) => s.addEntity);

  return (
    <WorkShell work={work} active="bible">
      <EntityForm
        heading="새 엔티티"
        subheading="World Bible에 새 설정 카드를 추가합니다."
        submitLabel="저장"
        onCancel={() => navigate({ to: '/works/$workId/bible', params: { workId: work.id } })}
        onSubmit={(input) => {
          const id = addEntity(work.id, input);
          toast.success(`'${input.name}' 엔티티를 추가했습니다`);
          navigate({
            to: '/works/$workId/bible',
            params: { workId: work.id },
            search: { entity: id },
          });
        }}
      />
    </WorkShell>
  );
}
