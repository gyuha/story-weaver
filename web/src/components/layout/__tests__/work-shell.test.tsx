import type { Work } from '@/features/shared/types';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkShell } from '../work-shell';

// jsdom은 matchMedia를 구현하지 않는다 — TopBar > UserMenu의 useTheme()이 호출한다.
window.matchMedia =
  window.matchMedia ||
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
    }: { to: string; children: ReactNode; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});

const WORK: Work = {
  id: 'w1',
  title: '테스트 작품',
  shortLabel: '테',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '구상',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

describe('WorkShell 사이드바 메뉴 순서', () => {
  it('시놉시스 → World Bible → 검토·타임라인 → 이미지 스타일 순서로 렌더된다', () => {
    render(
      <WorkShell work={WORK} active="synopsis">
        <div />
      </WorkShell>
    );

    const synopsis = screen.getByText('시놉시스');
    const bible = screen.getByText('World Bible');
    const timeline = screen.getByText('검토 · 타임라인');
    const artStyle = screen.getByText('이미지 스타일');

    // synopsis가 bible보다 앞(= bible이 synopsis 뒤)
    expect(synopsis.compareDocumentPosition(bible) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // bible이 timeline보다 앞
    expect(bible.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // timeline이 이미지 스타일보다 앞
    expect(
      timeline.compareDocumentPosition(artStyle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('이미지 스타일이 active면 그 항목에 활성 표시가 붙는다', () => {
    render(
      <WorkShell work={WORK} active="artStyle">
        <div />
      </WorkShell>
    );

    const artStyleLink = screen.getByText('이미지 스타일').closest('a');
    const synopsisLink = screen.getByText('시놉시스').closest('a');
    expect(artStyleLink?.className).toContain('font-medium');
    expect(synopsisLink?.className).not.toContain('font-medium');
  });
});
