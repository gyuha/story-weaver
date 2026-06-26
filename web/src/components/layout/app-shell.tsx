import type { ReactNode } from 'react';
import { TopBar } from './top-bar';

/** 전역(작업 외부) 셸 — 대시보드 등에서 사용. 사이드바 없이 상단 바 + 전체 폭 콘텐츠. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <TopBar />
      <div className="min-w-0 flex-1 overflow-y-auto bg-paper">{children}</div>
    </div>
  );
}
