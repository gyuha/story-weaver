import { WorkShell } from '@/components/layout/work-shell';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { EntityForm } from './entity-form';

export function EditEntityScreen({ work, entityId }: { work: Work; entityId?: string }) {
  const navigate = useNavigate();
  const updateEntity = useWorksStore((s) => s.updateEntity);
  const entity = work.entities.find((e) => e.id === entityId);

  // 없는 엔티티 → 상세로 리다이렉트
  if (!entity) {
    return <Navigate to="/works/$workId/bible" params={{ workId: work.id }} />;
  }

  const toDetail = () =>
    navigate({
      to: '/works/$workId/bible',
      params: { workId: work.id },
      search: { entity: entity.id },
    });

  return (
    <WorkShell work={work} active="bible">
      <EntityForm
        initial={entity}
        lockType
        heading="엔티티 수정"
        subheading="World Bible 설정 카드를 수정합니다."
        submitLabel="저장"
        onCancel={toDetail}
        onSubmit={(input) => {
          updateEntity(work.id, entity.id, input);
          toast.success(`'${input.name}' 엔티티를 수정했습니다`);
          toDetail();
        }}
      />
    </WorkShell>
  );
}
