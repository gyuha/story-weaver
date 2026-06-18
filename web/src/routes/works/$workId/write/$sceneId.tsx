import { WorkShell } from '@/components/layout/work-shell';
import { requireAuth } from '@/features/auth/lib/guard';
import { EditorScreen } from '@/features/editor/components/editor-screen';
import { findSceneLocation, useWork } from '@/features/shared/store/selectors';
import { Link, createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/write/$sceneId')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/write/${params.sceneId}`),
  component: WritePage,
});

function WritePage() {
  const { workId, sceneId } = useParams({ from: '/works/$workId/write/$sceneId' });
  const work = useWork(workId);
  const loc = findSceneLocation(work, sceneId);

  if (!work) return null;
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
