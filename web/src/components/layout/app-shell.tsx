import { useWorks } from '@/features/shared/store/selectors';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SidebarShell, UsageCard, WorkspaceHeader } from './sidebar-parts';
import { TopBar } from './top-bar';

const COVER_DOT: Record<string, string> = {
  dark: '#37352f',
  green: '#9bbf9f',
  orange: '#dba776',
};

/** 전역(작업 외부) 셸 — 대시보드 등에서 사용 */
export function AppShell({ children }: { children: ReactNode }) {
  const works = useWorks();

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SidebarShell>
          <WorkspaceHeader />
          <div className="h-1" />
          <div className="flex-1 overflow-y-auto">
            {works.map((work) => (
              <Link
                key={work.id}
                to="/works/$workId/write"
                params={{ workId: work.id }}
                className="mx-1.5 flex h-7 items-center gap-2.5 rounded-[3px] px-2.5 text-sm text-ink-soft transition-colors hover:bg-ink/[0.04]"
              >
                <span
                  className="size-3.5 shrink-0 rounded-[3px]"
                  style={{ background: COVER_DOT[work.coverTheme] }}
                />
                <span className="flex-1 truncate">{work.title}</span>
              </Link>
            ))}
          </div>

          <UsageCard />
        </SidebarShell>

        <div className="min-w-0 flex-1 overflow-y-auto bg-paper">{children}</div>
      </div>
    </div>
  );
}
