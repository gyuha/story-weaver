import type { Work } from '@/features/shared/types';
import { Clock, FileText, Search, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavItem, SectionLabel, SettingsRow, SidebarShell, WorkspaceHeader } from './sidebar-parts';
import { WorkTree } from './work-tree';

export type WorkSection = 'write' | 'bible' | 'synopsis' | 'timeline';

interface WorkShellProps {
  work: Work;
  active: WorkSection;
  activeSceneId?: string;
  children: ReactNode;
}

/** 작품 내부 셸 — 좌측 작업트리 사이드바 + 콘텐츠 슬롯 */
export function WorkShell({ work, active, activeSceneId, children }: WorkShellProps) {
  return (
    <div className="flex h-screen bg-paper text-ink">
      <SidebarShell>
        <WorkspaceHeader />
        <div className="h-1" />
        <NavItem icon={Search} label="검색" />
        <NavItem icon={Sparkles} label="AI 어시스턴트" iconClassName="text-ai" />

        <SectionLabel>{work.title}</SectionLabel>
        <NavItem
          icon={Sparkles}
          label="World Bible"
          iconClassName="text-ai"
          active={active === 'bible'}
          to="/works/$workId/bible"
          params={{ workId: work.id }}
        />
        <NavItem
          icon={FileText}
          label="시놉시스"
          active={active === 'synopsis'}
          to="/works/$workId/synopsis"
          params={{ workId: work.id }}
        />
        <NavItem
          icon={Clock}
          label="검토 · 타임라인"
          active={active === 'timeline'}
          to="/works/$workId/timeline"
          params={{ workId: work.id }}
        />

        <WorkTree work={work} activeSceneId={activeSceneId} />

        <SettingsRow />
      </SidebarShell>

      <div className="flex min-w-0 flex-1 flex-col bg-paper">{children}</div>
    </div>
  );
}
