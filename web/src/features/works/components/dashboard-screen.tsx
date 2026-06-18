import { AppShell } from '@/components/layout/app-shell';
import { useWorks } from '@/features/shared/store/selectors';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { NewWorkCard, WorkCard } from './work-card';

/** 작품 대시보드 화면 (셸 포함) — /works 와 /works/new 가 공유 */
export function DashboardScreen() {
  const works = useWorks();
  const lastEdited = works[0]?.lastEditedLabel.split(' · ')[0] ?? '방금';

  return (
    <AppShell>
      <div className="p-[38px_40px]">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <h1 className="mb-1.5 font-sans text-[30px] font-bold tracking-[-0.02em]">내 작품</h1>
            <div className="text-sm text-muted-ink">
              {works.length}개의 작품 · 마지막 작업 {lastEdited}
            </div>
          </div>
          <Link
            to="/works/new"
            className="flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[5px] bg-primary px-[15px] text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" strokeWidth={2.2} />새 작품
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {works.map((work) => (
            <WorkCard key={work.id} work={work} />
          ))}
          <NewWorkCard />
        </div>
      </div>
    </AppShell>
  );
}
