import { WorkShell } from '@/components/layout/work-shell';
import { requireAuth } from '@/features/auth/lib/guard';
import { defaultSceneId, useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import { createFileRoute, redirect, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/write/')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}/write`);
    const work = useWorksStore.getState().works.find((w) => w.id === params.workId);
    if (!work) throw redirect({ to: '/works' });
    const sceneId = defaultSceneId(work);
    if (sceneId) {
      throw redirect({
        to: '/works/$workId/write/$sceneId',
        params: { workId: params.workId, sceneId },
      });
    }
  },
  component: EmptyEditor,
});

function EmptyEditor() {
  const { workId } = useParams({ from: '/works/$workId/write/' });
  const work = useWork(workId);
  if (!work) return null;

  return (
    <WorkShell work={work} active="write">
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mb-3 font-serif text-[22px] font-bold text-ink">{work.title}</div>
          <p className="text-sm leading-relaxed text-muted-ink">
            아직 씬이 없습니다. 작업트리에서 새 씬을 만들어 첫 문장을 시작하세요. World Bible에
            인물·장소를 먼저 등록하면 메모리가 함께 작동합니다.
          </p>
        </div>
      </div>
    </WorkShell>
  );
}
