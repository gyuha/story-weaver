import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { useWork } from '@/features/shared/store/selectors';
import { TimelineScreen } from '@/features/timeline/components/timeline-screen';
import { useWorkConflicts } from '@/features/timeline/lib/hydrate-conflicts';
import { useWorkTimelineStates } from '@/features/timeline/lib/hydrate-timeline';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/timeline')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/timeline`),
  component: TimelinePage,
});

function TimelinePage() {
  const { workId } = useParams({ from: '/works/$workId/timeline' });
  const work = useWork(workId);
  const chapters = useWorkChapters(workId);
  const timelineStates = useWorkTimelineStates(workId);
  const conflicts = useWorkConflicts(workId);
  const isPending = chapters.isPending || timelineStates.isPending || conflicts.isPending;
  const isError = chapters.isError || timelineStates.isError || conflicts.isError;
  if (!work) return null;

  if (isPending) {
    return (
      <WorkShell work={work} active="timeline">
        <output className="block flex-1 p-10" aria-label="검토 정보를 불러오는 중">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </output>
      </WorkShell>
    );
  }

  if (isError) {
    return (
      <WorkShell work={work} active="timeline">
        <div className="flex-1 p-10">
          <Alert variant="destructive">
            <AlertTitle>검토 정보를 불러오지 못했습니다</AlertTitle>
            <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
          </Alert>
        </div>
      </WorkShell>
    );
  }

  return <TimelineScreen work={work} />;
}
