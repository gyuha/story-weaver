import { useUsage, useWorkspaceMeta } from '@/features/shared/store/selectors';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronsLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** 좌측 사이드바 컨테이너 (surface 배경, 우측 경계) */
export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface pt-1.5">
      {children}
    </aside>
  );
}

/** 워크스페이스 스위처 헤더 — 누르면 작품 목록으로 이동 */
export function WorkspaceHeader() {
  const { workspaceName, authorInitial } = useWorkspaceMeta();
  return (
    <Link
      to="/works"
      className="mx-1 flex h-[42px] items-center gap-2.5 rounded-[5px] px-2.5 transition-colors hover:bg-ink/[0.04]"
    >
      <div className="grid size-[22px] shrink-0 place-items-center rounded-[5px] bg-ink font-serif text-[12px] font-bold text-white">
        {authorInitial}
      </div>
      <span className="flex-1 truncate text-sm font-semibold text-ink">{workspaceName}</span>
      <ChevronsLeft className="size-[15px] text-faint" />
    </Link>
  );
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  iconClassName?: string;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
}

export function NavItem({
  icon: Icon,
  label,
  active,
  iconClassName,
  to,
  params,
  onClick,
}: NavItemProps) {
  const className = cn(
    'mx-1.5 flex h-7 items-center gap-2 rounded-[3px] px-2.5 text-sm transition-colors',
    active ? 'bg-ink/[0.08] font-medium text-ink' : 'text-ink-soft hover:bg-ink/[0.04]'
  );
  const content = (
    <>
      <Icon className={cn('size-4 text-faint', iconClassName)} strokeWidth={2} />
      <span className="flex-1 truncate">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} params={params} className={className} activeOptions={{ exact: false }}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(className, 'text-left')}>
      {content}
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-3.5 pt-4 pb-1 text-xs font-semibold text-faint">{children}</div>;
}

/** 이번 달 AI 생성 사용량 카드 */
export function UsageCard() {
  const usage = useUsage();
  const pct = Math.round((usage.usedTokens / usage.totalTokens) * 100);
  const fmt = (n: number) => `${Math.round(n / 10000)}만`;
  return (
    <div className="mx-3 mb-2.5 rounded-lg border border-line bg-paper p-[11px_13px]">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-ink">
        <span>이번 달 AI 생성</span>
        <span className="font-semibold text-ink">{pct}%</span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#ececeb]">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-faint">
        {usage.plan} · {fmt(usage.usedTokens)} / {fmt(usage.totalTokens)} 토큰
      </div>
    </div>
  );
}
