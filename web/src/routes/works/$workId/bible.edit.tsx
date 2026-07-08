import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { EditEntityScreen } from '@/features/world-bible/components/edit-entity-screen';
import { useWorkEntities } from '@/features/world-bible/lib/hydrate-entities';
import { createFileRoute, useParams, useSearch } from '@tanstack/react-router';

interface BibleEditSearch {
  entity?: string;
}

export const Route = createFileRoute('/works/$workId/bible/edit')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/bible/edit`),
  validateSearch: (search: Record<string, unknown>): BibleEditSearch => ({
    entity: typeof search.entity === 'string' ? search.entity : undefined,
  }),
  component: EditEntityPage,
});

function EditEntityPage() {
  const { workId } = useParams({ from: '/works/$workId/bible/edit' });
  const { entity } = useSearch({ from: '/works/$workId/bible/edit' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkEntities(workId);
  if (!work) return null;

  if (isPending) {
    return (
      <WorkShell work={work} active="bible">
        <output className="block flex-1 p-10" aria-label="엔티티 정보를 불러오는 중">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </output>
      </WorkShell>
    );
  }

  if (isError) {
    return (
      <WorkShell work={work} active="bible">
        <div className="flex-1 p-10">
          <Alert variant="destructive">
            <AlertTitle>엔티티 정보를 불러오지 못했습니다</AlertTitle>
            <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
          </Alert>
        </div>
      </WorkShell>
    );
  }

  return <EditEntityScreen work={work} entityId={entity} />;
}
