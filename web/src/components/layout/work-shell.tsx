import type { Work } from '@/features/shared/types';
import { ManuscriptDownloadButton } from '@/features/works/components/manuscript-download-button';
import { Clock, FileText, Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { NavItem, SectionLabel, SidebarShell, WorkspaceHeader } from './sidebar-parts';
import { TopBar } from './top-bar';
import { WorkTree } from './work-tree';

export type WorkSection = 'write' | 'bible' | 'synopsis' | 'timeline';

interface WorkShellProps {
  work: Work;
  active: WorkSection;
  activeChapterId?: string;
  children: ReactNode;
}

/** 작품 내부 셸 — 좌측 작업트리 사이드바 + 콘텐츠 슬롯 */
export function WorkShell({ work, active, activeChapterId, children }: WorkShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SidebarShell collapsed={collapsed} onExpand={() => setCollapsed(false)}>
          <WorkspaceHeader collapsed={collapsed} onCollapse={() => setCollapsed(true)} />

          {/* 기능 메뉴 블록 */}
          <div className="mt-1 flex flex-col">
            <NavItem
              icon={FileText}
              label="시놉시스"
              active={active === 'synopsis'}
              to="/works/$workId/synopsis"
              params={{ workId: work.id }}
            />
            <NavItem
              icon={Sparkles}
              label="World Bible"
              iconClassName="text-ai"
              active={active === 'bible'}
              to="/works/$workId/bible"
              params={{ workId: work.id }}
            />
            <NavItem
              icon={Clock}
              label="검토 · 타임라인"
              active={active === 'timeline'}
              to="/works/$workId/timeline"
              params={{ workId: work.id }}
            />
          </div>

          {/* 구분선 — 기능과 콘텐츠 분리 */}
          <div className="mx-3 mt-2 border-t border-line" />

          {/* 콘텐츠(원고) 섹션 — 작품명을 헤더로, 트리에 집중 */}
          <SectionLabel>{work.title}</SectionLabel>
          <WorkTree work={work} activeChapterId={activeChapterId} />

          {/* 하단 고정 — 소설 다운로드 (WorkTree가 flex-1이라 이 shrink-0 블록은 항상 바닥에 붙는다) */}
          <div className="shrink-0 border-t border-line p-1.5">
            <ManuscriptDownloadButton work={work} />
          </div>
        </SidebarShell>

        <div className="flex min-w-0 flex-1 flex-col bg-paper">{children}</div>
      </div>
    </div>
  );
}
