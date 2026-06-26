import { useWork } from '@/features/shared/store/selectors';
import { BibleScreen } from '@/features/world-bible/components/bible-screen';
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
  if (!work) return null;
  return <BibleScreen work={work} selectedEntityId={entity} />;
}
