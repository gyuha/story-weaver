import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { RelationshipGraphScreen } from '@/features/world-bible/components/relationship-graph-screen';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/bible/relationships')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/bible/relationships`),
  component: RelationshipsPage,
});

function RelationshipsPage() {
  const { workId } = useParams({ from: '/works/$workId/bible/relationships' });
  const work = useWork(workId);
  if (!work) return null;
  return <RelationshipGraphScreen work={work} />;
}
