import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { defaultChapterId, useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import { createFileRoute, redirect, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/works/$workId/write/')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}/write`);
    const work = useWorksStore.getState().works.find((w) => w.id === params.workId);
    const chapterId = defaultChapterId(work);
    if (chapterId) {
      throw redirect({
        to: '/works/$workId/write/$chapterId',
        params: { workId: params.workId, chapterId },
      });
    }
  },
  component: EmptyEditor,
});

function EmptyEditor() {
  const { workId } = useParams({ from: '/works/$workId/write/' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkChapters(workId);
  const navigate = useNavigate();

  // 서버 계층 하이드레이션으로 화가 뒤늦게 채워지면 beforeLoad가 놓친 기본 화로 이동
  useEffect(() => {
    const chapterId = defaultChapterId(work);
    if (chapterId) {
      navigate({
        to: '/works/$workId/write/$chapterId',
        params: { workId, chapterId },
        replace: true,
      });
    }
  }, [work, workId, navigate]);

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

  return (
    <WorkShell work={work} active="write">
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mb-3 font-serif text-[22px] font-bold text-ink">{work.title}</div>
          <p className="text-sm leading-relaxed text-muted-ink">
            아직 화가 없습니다. 작업트리에서 새 화를 만들어 첫 문장을 시작하세요. World Bible에
            인물·장소를 먼저 등록하면 메모리가 함께 작동합니다.
          </p>
        </div>
      </div>
    </WorkShell>
  );
}
