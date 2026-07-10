import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import { createFileRoute, redirect, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/works/$workId/read/')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}/read`);
    const work = useWorksStore.getState().works.find((w) => w.id === params.workId);
    // chapters가 이미 로드된 경우에만 첫 챕터로 fast-path 리다이렉트.
    // 딥링크 등으로 chapters가 아직 []인 경우는 통과시켜 컴포넌트의 하이드레이션에 맡긴다.
    if (work && work.chapters.length > 0) {
      throw redirect({
        to: '/works/$workId/read/$chapterId',
        params: { workId: params.workId, chapterId: work.chapters[0].id },
      });
    }
  },
  component: ReadIndexPage,
});

export function ReadIndexPage() {
  const { workId } = useParams({ from: '/works/$workId/read/' });
  const work = useWork(workId);
  const { isPending, isError } = useWorkChapters(workId);
  const navigate = useNavigate();

  // 하이드레이션 완료 후 첫 챕터로, 챕터가 없으면 집필 화면으로 교정.
  // 렌더 클로저의 work는 setWorkChapters가 같은 커밋에서 반영한 chapters를 못 볼 수 있어
  // 스토어를 직접 읽는다(WorkLayout의 하이드레이션 경합 수정과 동일한 이유).
  useEffect(() => {
    if (isPending || isError) return;
    const fresh = useWorksStore.getState().works.find((w) => w.id === workId);
    if (!fresh) return;
    const chapterId = fresh.chapters[0]?.id;
    if (chapterId) {
      navigate({
        to: '/works/$workId/read/$chapterId',
        params: { workId, chapterId },
        replace: true,
      });
    } else {
      navigate({ to: '/works/$workId/write', params: { workId }, replace: true });
    }
  }, [isPending, isError, workId, navigate]);

  if (!work) return null;

  if (isPending) {
    return (
      <output aria-label="원고를 불러오는 중" className="grid h-screen place-items-center p-10">
        <div className="w-full max-w-md">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </output>
    );
  }

  if (isError) {
    return (
      <div className="grid h-screen place-items-center p-10">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>원고를 불러오지 못했습니다</AlertTitle>
          <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}
