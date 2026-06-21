import { requireAuth } from '@/features/auth/lib/guard';
import { useWorksStore } from '@/features/shared/store/works.store';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/read/')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}/read`);
    const work = useWorksStore.getState().works.find((w) => w.id === params.workId);
    if (!work) throw redirect({ to: '/works' });
    const chapterId = work.chapters[0]?.id;
    if (chapterId) {
      throw redirect({
        to: '/works/$workId/read/$chapterId',
        params: { workId: params.workId, chapterId },
      });
    }
    // 챕터가 하나도 없으면 집필 화면으로
    throw redirect({ to: '/works/$workId/write', params: { workId: params.workId } });
  },
});
