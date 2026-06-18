import { useWorks, useWorkspaceMeta } from '@/features/shared/store/selectors';
import { Link } from '@tanstack/react-router';
import { Library, Search, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  NavItem,
  SectionLabel,
  SettingsRow,
  SidebarShell,
  UsageCard,
  WorkspaceHeader,
} from './sidebar-parts';

const COVER_DOT: Record<string, string> = {
  dark: '#37352f',
  green: '#9bbf9f',
  orange: '#dba776',
};

/** 전역(작업 외부) 셸 — 대시보드 등에서 사용 */
export function AppShell({ children }: { children: ReactNode }) {
  const works = useWorks();
  const { authorInitial } = useWorkspaceMeta();

  return (
    <div className="flex h-screen bg-paper text-ink">
      <SidebarShell>
        <WorkspaceHeader />
        <div className="h-1" />
        <NavItem icon={Search} label="검색" />
        <NavItem icon={Sparkles} label="AI 어시스턴트" iconClassName="text-ai" />
        <NavItem icon={Library} label="작품" active />

        <SectionLabel>최근 작품</SectionLabel>
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
        <SettingsRow />
      </SidebarShell>

      <div className="flex min-w-0 flex-1 flex-col bg-paper">
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-ink/[0.06] px-10">
          <span className="text-[15px] font-semibold text-ink">작품</span>
          <span className="flex-1" />
          <div className="grid size-[30px] place-items-center rounded-full bg-[#cf8a4b] text-[13px] font-semibold text-white">
            {authorInitial}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
