import { cn } from '@/lib/utils';
import { Link, Outlet } from '@tanstack/react-router';
import { ArrowLeft, BarChart3, UserCheck } from 'lucide-react';

const NAV = [
  { to: '/admin', label: '계정 승인', icon: UserCheck, exact: true },
  { to: '/admin/stats', label: '통계', icon: BarChart3, exact: false },
] as const;

/** /admin 레이아웃: 좌측 세로 네비 + 우측 Outlet. settings-shell 패턴과 동일 스타일. */
export function AdminShell() {
  return (
    <div className="flex h-screen bg-paper text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface pt-1.5">
        <Link
          to="/works"
          className="mx-1.5 mt-1 mb-2 flex h-8 items-center gap-2 rounded-[3px] px-2.5 text-sm text-muted-ink transition-colors hover:bg-ink/[0.04]"
        >
          <ArrowLeft className="size-4 text-faint" strokeWidth={2} />
          <span>작품으로</span>
        </Link>
        <div className="px-3.5 pt-2 pb-1 text-xs font-semibold text-faint">관리자</div>
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact }}
            className={cn(
              'mx-1.5 flex h-7 items-center gap-2 rounded-[3px] px-2.5 text-sm text-ink-soft transition-colors hover:bg-ink/[0.04]'
            )}
            activeProps={{ className: 'bg-ink/[0.08] font-medium text-ink' }}
          >
            <Icon className="size-4 text-faint" strokeWidth={2} />
            <span className="flex-1 truncate">{label}</span>
          </Link>
        ))}
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper">
        <Outlet />
      </div>
    </div>
  );
}
