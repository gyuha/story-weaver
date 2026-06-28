import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { EditEntityScreen } from '@/features/world-bible/components/edit-entity-screen';
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
  if (!work) return null;
  return <EditEntityScreen work={work} entityId={entity} />;
}
