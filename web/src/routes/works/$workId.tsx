import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import { useHydrateWorks } from '@/features/works/lib/hydrate-works';
import { useWorkEntities } from '@/features/world-bible/lib/hydrate-entities';
import { Outlet, createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/works/$workId')({
  component: WorkLayout,
});

/** /works/$workId 이하 전 라우트의 레이아웃 — 딥링크·새로고침 시 works 스토어를 하이드레이션한다. */
export function WorkLayout() {
  const { workId } = useParams({ from: '/works/$workId' });
  const { isPending, isError } = useHydrateWorks();
  const work = useWork(workId);
  const navigate = useNavigate();

  // World Bible 엔티티도 작품 진입 시 함께 하이드레이션한다 — 에디터·메모리 패널 등
  // World Bible 화면을 거치지 않는 라우트에서도 work.entities를 보장하기 위함.
  // 렌더는 블로킹하지 않고(작품 존재 확인은 works 하이드레이션만 게이트) 백그라운드로 채운다.
  useWorkEntities(workId);

  // 조회가 끝났는데도 work이 없으면(존재하지 않는 작품) 목록으로 되돌린다.
  // NOTE: 위 work 변수가 아니라 스토어를 직접 읽는다 — useHydrateWorks의 setWorks가
  // 이 컴포넌트의 effect보다 먼저(같은 훅 호출 순서) 커밋되므로 최신 상태를 보장하지만,
  // 렌더 시점에 캡처된 work 클로저는 그 커밋 이전 스냅샷이라 한 틱 뒤처질 수 있다.
  useEffect(() => {
    if (isPending || isError) return;
    const exists = useWorksStore.getState().works.some((w) => w.id === workId);
    if (!exists) navigate({ to: '/works', replace: true });
  }, [workId, isPending, isError, navigate]);

  if (work) return <Outlet />;

  if (isPending) {
    return (
      <output aria-label="작품을 불러오는 중" className="grid h-screen place-items-center p-10">
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
          <AlertTitle>작품 정보를 불러오지 못했습니다</AlertTitle>
          <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}
