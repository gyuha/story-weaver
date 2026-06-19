import { cn } from '@/lib/utils';
import { Link, Outlet } from '@tanstack/react-router';
import { ArrowLeft, SlidersHorizontal, UserRound } from 'lucide-react';

const NAV = [
  { to: '/settings/account', label: '개인 설정', icon: UserRound },
  { to: '/settings/llm', label: 'LLM 설정', icon: SlidersHorizontal },
] as const;

/** /settings 레이아웃: 좌측 세로 네비 + 우측 Outlet (중첩 라우트가 채움). */
export function SettingsShell() {
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
        <div className="px-3.5 pt-2 pb-1 text-xs font-semibold text-faint">설정</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
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
