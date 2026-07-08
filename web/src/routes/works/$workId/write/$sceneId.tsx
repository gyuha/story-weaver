import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { EditorScreen } from '@/features/editor/components/editor-screen';
import { useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { findSceneLocation, useWork } from '@/features/shared/store/selectors';
import { Link, createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/write/$sceneId')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/write/${params.sceneId}`),
  component: WritePage,
});

function WritePage() {
  const { workId, sceneId } = useParams({ from: '/works/$workId/write/$sceneId' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkChapters(workId);
  const loc = findSceneLocation(work, sceneId);

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
  if (!loc) {
    return (
      <WorkShell work={work} active="write">
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <div className="mb-2 text-sm text-muted-ink">씬을 찾을 수 없습니다.</div>
            <Link
              to="/works/$workId/write"
              params={{ workId }}
              className="text-sm font-medium text-primary"
            >
              첫 씬으로 이동
            </Link>
          </div>
        </div>
      </WorkShell>
    );
  }

  return <EditorScreen work={work} chapter={loc.chapter} scene={loc.scene} />;
}
