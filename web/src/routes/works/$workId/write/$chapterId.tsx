import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { EditorScreen } from '@/features/editor/components/editor-screen';
import { useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { findChapter, useWork } from '@/features/shared/store/selectors';
import { Link, createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/write/$chapterId')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/write/${params.chapterId}`),
  component: WritePage,
});

function WritePage() {
  const { workId, chapterId } = useParams({ from: '/works/$workId/write/$chapterId' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkChapters(workId);
  const chapter = findChapter(work, chapterId);

  if (!work) return null;
  if (isPending) {
    return (
      <WorkShell work={work} active="write">
        <output className="block flex-1 p-10" aria-label="원고를 불러오는 중">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </output>
      </WorkShell>
    );
  }
  if (isError) {
    return (
      <WorkShell work={work} active="write">
        <div className="flex-1 p-10">
          <Alert variant="destructive">
            <AlertTitle>원고를 불러오지 못했습니다</AlertTitle>
            <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
          </Alert>
        </div>
      </WorkShell>
    );
  }
  if (!chapter) {
    return (
      <WorkShell work={work} active="write">
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <div className="mb-2 text-sm text-muted-ink">화를 찾을 수 없습니다.</div>
            <Link
              to="/works/$workId/write"
              params={{ workId }}
              className="text-sm font-medium text-primary"
            >
              첫 화로 이동
            </Link>
          </div>
        </div>
      </WorkShell>
    );
  }

  return <EditorScreen work={work} chapter={chapter} />;
}
