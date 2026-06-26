import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { NewEntityScreen } from '@/features/world-bible/components/new-entity-screen';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/bible/new')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/bible/new`),
  component: NewEntityPage,
});

function NewEntityPage() {
  const { workId } = useParams({ from: '/works/$workId/bible/new' });
  const work = useWork(workId);
  if (!work) return null;
  return <NewEntityScreen work={work} />;
}
