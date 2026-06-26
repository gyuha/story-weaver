import { useWorkspaceMeta } from '@/features/shared/store/selectors';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

/** 좌측 사이드바 컨테이너 (surface 배경, 우측 경계). collapsed면 얇은 레일로 줄인다. */
export function SidebarShell({
  collapsed,
  onExpand,
  children,
}: {
  collapsed?: boolean;
  onExpand?: () => void;
  children: ReactNode;
}) {
  // 접으면 « 버튼이 hidden 서브트리로 사라져 포커스가 body로 유실되므로, 새로 나타난 펼치기 버튼으로 옮긴다.
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (collapsed) expandRef.current?.focus();
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-line bg-surface',
        collapsed ? 'w-12 items-center pt-2' : 'w-60 pt-1.5'
      )}
    >
      {collapsed && (
        <button
          ref={expandRef}
          type="button"
          onClick={onExpand}
          aria-label="사이드바 펼치기"
          aria-expanded={false}
          title="사이드바 펼치기"
          className="grid size-8 place-items-center rounded-[5px] text-faint transition-colors hover:bg-ink/[0.04] hover:text-ink-soft"
        >
          <ChevronsRight className="size-4" />
        </button>
      )}
      {/* 접어도 자식을 언마운트하지 않고 숨겨, WorkTree의 부/화 펼침 상태를 보존한다 */}
      <div className={cn('flex w-full min-h-0 flex-1 flex-col', collapsed && 'hidden')}>
        {children}
      </div>
    </aside>
  );
}

/** 워크스페이스 스위처 헤더 — 이름은 작품 목록으로 이동, onCollapse가 있으면 « 로 사이드바를 접는다. */
export function WorkspaceHeader({
  collapsed,
  onCollapse,
}: {
  collapsed?: boolean;
  onCollapse?: () => void;
}) {
  const { workspaceName, authorInitial } = useWorkspaceMeta();
  // 펼침 직후 « 버튼이 다시 나타날 때 포커스를 되돌린다(접기 방향은 SidebarShell이 처리). 초기 마운트는 건너뛴다.
  const collapseRef = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!collapsed) collapseRef.current?.focus();
  }, [collapsed]);
  return (
    <div className="mx-1 flex h-[42px] items-center gap-0.5">
      <Link
        to="/works"
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[5px] px-2.5 transition-colors hover:bg-ink/[0.04]"
      >
        <div className="grid size-[22px] shrink-0 place-items-center rounded-[5px] bg-ink font-serif text-[12px] font-bold text-white">
          {authorInitial}
        </div>
        <span className="flex-1 truncate text-sm font-semibold text-ink">{workspaceName}</span>
      </Link>
      {onCollapse && (
        <button
          ref={collapseRef}
          type="button"
          onClick={onCollapse}
          aria-label="사이드바 접기"
          aria-expanded={!collapsed}
          title="사이드바 접기"
          className="grid size-7 shrink-0 place-items-center rounded-[5px] text-faint transition-colors hover:bg-ink/[0.04] hover:text-ink-soft"
        >
          <ChevronsLeft className="size-[15px]" />
        </button>
      )}
    </div>
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
