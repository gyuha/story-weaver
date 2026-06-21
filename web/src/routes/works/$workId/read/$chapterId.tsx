import { requireAuth } from '@/features/auth/lib/guard';
import { ReadingScreen } from '@/features/editor/components/reading-screen';
import { findChapterNav, useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import { createFileRoute, redirect, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/read/$chapterId')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}/read/${params.chapterId}`);
    const work = useWorksStore.getState().works.find((w) => w.id === params.workId);
    if (!work) throw redirect({ to: '/works' });
    // 잘못된 챕터 → 기본(첫) 챕터로, 챕터가 없으면 집필로 폴백
    if (!work.chapters.some((c) => c.id === params.chapterId)) {
      const fallback = work.chapters[0]?.id;
      throw redirect(
        fallback
          ? {
              to: '/works/$workId/read/$chapterId',
              params: { workId: params.workId, chapterId: fallback },
            }
          : { to: '/works/$workId/write', params: { workId: params.workId } }
      );
    }
  },
  component: ReadPage,
});

function ReadPage() {
  const { workId, chapterId } = useParams({ from: '/works/$workId/read/$chapterId' });
  const work = useWork(workId);
  const nav = findChapterNav(work, chapterId);

  if (!work || !nav) return null;

  return (
    <ReadingScreen
      work={work}
      chapter={nav.chapter}
      prevId={nav.prevId}
      nextId={nav.nextId}
      editSceneId={nav.chapter.scenes[0]?.id}
    />
  );
}
