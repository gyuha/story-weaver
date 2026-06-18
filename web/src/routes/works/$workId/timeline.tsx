import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { TimelineScreen } from '@/features/timeline/components/timeline-screen';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/timeline')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/timeline`),
  component: TimelinePage,
});

function TimelinePage() {
  const { workId } = useParams({ from: '/works/$workId/timeline' });
  const work = useWork(workId);
  if (!work) return null;
  return <TimelineScreen work={work} />;
}
