import { WorkShell } from '@/components/layout/work-shell';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { ArtStyleScreen } from '@/features/works/components/art-style-screen';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/art-style')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/art-style`),
  component: ArtStylePage,
});

function ArtStylePage() {
  const { workId } = useParams({ from: '/works/$workId/art-style' });
  const work = useWork(workId);
  if (!work) return null;

  return (
    <WorkShell work={work} active="artStyle">
      <div className="h-full overflow-y-auto">
        <ArtStyleScreen work={work} />
      </div>
    </WorkShell>
  );
}
