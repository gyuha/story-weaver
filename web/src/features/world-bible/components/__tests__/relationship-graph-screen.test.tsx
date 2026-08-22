import type { Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/work-shell', () => ({
  WorkShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const mockGraph = vi.fn();
vi.mock('@/features/world-bible/api/relationships.api', () => ({
  relationshipsApi: { graph: (...args: unknown[]) => mockGraph(...args) },
}));

import { RelationshipGraphScreen } from '../relationship-graph-screen';

const WORK_ID = 'w1';

const WORK: Work = {
  id: WORK_ID,
  title: '천뢰검전',
  shortLabel: '천',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '연재 중',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '만자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [
    {
      id: 'ch1',
      episodeId: 'ep1',
      partLabel: '제1부',
      index: 1,
      title: '1화',
      status: 'done',
      paragraphs: [],
      linkedEntityIds: [],
      vectorMemory: [],
    },
    {
      id: 'ch2',
      episodeId: 'ep1',
      partLabel: '제1부',
      index: 2,
      title: '2화',
      status: 'done',
      paragraphs: [],
      linkedEntityIds: [],
      vectorMemory: [],
    },
  ],
  entities: [],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RelationshipGraphScreen work={WORK} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RelationshipGraphScreen', () => {
  it('로딩 중에는 로딩 표시를 보여준다', () => {
    mockGraph.mockImplementation(() => new Promise(() => {}));

    renderScreen();

    expect(screen.getByRole('status', { name: '관계도를 불러오는 중' })).toBeInTheDocument();
  });

  it('조회에 실패하면 에러 얼럿을 보여준다', async () => {
    mockGraph.mockRejectedValue(new Error('network error'));

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('관계도를 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('성공하면 소스 엔티티별로 묶은 관계 목록을 보여주고 요약이 없으면 요약 블록을 그리지 않는다', async () => {
    mockGraph.mockResolvedValue({
      edges: [
        {
          sourceEntityId: 'en1',
          sourceName: '김철수',
          targetEntityId: 'en2',
          targetName: '이영희',
          type: '사제',
          note: null,
        },
      ],
      summary: null,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('김철수')).toBeInTheDocument();
    });
    expect(screen.getByText('사제')).toBeInTheDocument();
    expect(screen.getByText('이영희')).toBeInTheDocument();
    expect(screen.queryByText('이 시점까지의 관계 요약')).not.toBeInTheDocument();
  });

  it('시점을 선택하면 up_to_chapter_id로 다시 조회하고 요약을 보여준다', async () => {
    mockGraph.mockImplementation((options: { query?: { up_to_chapter_id?: string } }) => {
      if (options?.query?.up_to_chapter_id) {
        return Promise.resolve({
          edges: [
            {
              sourceEntityId: 'en1',
              sourceName: '김철수',
              targetEntityId: 'en2',
              targetName: '이영희',
              type: '원수',
              note: null,
            },
          ],
          summary: '2화 시점까지 두 사람은 원수가 되었다.',
        });
      }
      return Promise.resolve({
        edges: [
          {
            sourceEntityId: 'en1',
            sourceName: '김철수',
            targetEntityId: 'en2',
            targetName: '이영희',
            type: '사제',
            note: null,
          },
        ],
        summary: null,
      });
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('사제')).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText('시점 선택'), 'ch2');

    await waitFor(() => {
      expect(screen.getByText('2화 시점까지 두 사람은 원수가 되었다.')).toBeInTheDocument();
    });
    expect(screen.getByText('원수')).toBeInTheDocument();
    expect(mockGraph).toHaveBeenLastCalledWith({
      path: { work_id: WORK_ID },
      query: { up_to_chapter_id: 'ch2' },
    });
  });
});
