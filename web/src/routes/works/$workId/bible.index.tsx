import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useWork } from '@/features/shared/store/selectors';
import { BibleScreen } from '@/features/world-bible/components/bible-screen';
import { useWorkEntities } from '@/features/world-bible/lib/hydrate-entities';
import { createFileRoute, useParams, useSearch } from '@tanstack/react-router';

interface BibleSearch {
  entity?: string;
}

export const Route = createFileRoute('/works/$workId/bible/')({
  validateSearch: (search: Record<string, unknown>): BibleSearch => ({
    entity: typeof search.entity === 'string' ? search.entity : undefined,
  }),
  component: BiblePage,
});

function BiblePage() {
  const { workId } = useParams({ from: '/works/$workId/bible/' });
  const { entity } = useSearch({ from: '/works/$workId/bible/' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkEntities(workId);
  if (!work) return null;

  if (isPending) {
    return (
      <WorkShell work={work} active="bible">
        <output className="block flex-1 p-10" aria-label="World Bible을 불러오는 중">
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
            <AlertTitle>World Bible을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
          </Alert>
        </div>
      </WorkShell>
    );
  }

  return <BibleScreen work={work} selectedEntityId={entity} />;
}
