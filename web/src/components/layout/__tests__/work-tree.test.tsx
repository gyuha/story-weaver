import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('sonner', () => {
  const toast = vi.fn() as unknown as {
    (message: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { toast };
});

const mockReorderChapters = vi.fn();
const mockReorderEpisodes = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: {
    reorderChapters: (...args: unknown[]) => mockReorderChapters(...args),
    reorderEpisodes: (...args: unknown[]) => mockReorderEpisodes(...args),
  },
}));

import { toast } from 'sonner';
import { WorkTree } from '../work-tree';

function makeWork(): Work {
  return {
    id: 'w1',
    title: '제목',
    shortLabel: '제',
    genre: '무협',
    subGenre: '회귀',
    keywords: [],
    style: '간결체',
    status: '구상',
    coverTheme: 'dark',
    stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
    lastEditedLabel: '방금',
    chapters: [
      {
        id: 'ch1',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 1,
        title: '첫화',
        scenes: [
          {
            id: 'sc1',
            title: '씬1',
            status: 'draft',
            paragraphs: [],
            linkedEntityIds: [],
            vectorMemory: [],
          },
        ],
      },
      {
        id: 'ch2',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 2,
        title: '둘째화',
        scenes: [
          {
            id: 'sc2',
            title: '씬2',
            status: 'draft',
            paragraphs: [],
            linkedEntityIds: [],
            vectorMemory: [],
          },
        ],
      },
      {
        id: 'ch3',
        episodeId: 'ep2',
        partLabel: '제2부',
        index: 1,
        title: '셋째화',
        scenes: [
          {
            id: 'sc3',
            title: '씬3',
            status: 'draft',
            paragraphs: [],
            linkedEntityIds: [],
            vectorMemory: [],
          },
        ],
      },
    ],
    entities: [],
    timeline: [],
    conflicts: [],
    reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
  };
}

// work을 store에서 구독해 실제 화면처럼 재배치 후 리렌더를 확인하는 얇은 테스트 하니스
function Harness() {
  const work = useWorksStore((s) => s.works.find((w) => w.id === 'w1'));
  if (!work) return null;
  return <WorkTree work={work} activeSceneId="sc1" />;
}

function drag(from: HTMLElement, to: HTMLElement) {
  fireEvent.dragStart(from);
  fireEvent.dragOver(to);
  fireEvent.drop(to);
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [makeWork()] });
});

describe('WorkTree 드래그 앤 드롭', () => {
  it('화를 다른 위치로 드래그하면 reorder API를 새 순서로 호출하고 트리 순서를 갱신한다', async () => {
    mockReorderChapters.mockResolvedValue(undefined);
    render(<Harness />);

    const before = screen.getAllByText(/^\d화 ·/).map((el) => el.textContent);
    expect(before).toEqual(['1화 · 첫화', '2화 · 둘째화']);

    drag(screen.getByText('2화 · 둘째화'), screen.getByText('1화 · 첫화'));

    await waitFor(() => {
      expect(mockReorderChapters).toHaveBeenCalledWith({
        path: { work_id: 'w1', episode_id: 'ep1' },
        body: ['ch2', 'ch1'],
      });
    });
    await waitFor(() => {
      const after = screen.getAllByText(/^\d화 ·/).map((el) => el.textContent);
      expect(after).toEqual(['1화 · 둘째화', '2화 · 첫화']);
    });
  });

  it('reorder API가 실패하면 에러를 토스트로 표시한다', async () => {
    mockReorderChapters.mockRejectedValue(new Error('network error'));
    render(<Harness />);

    drag(screen.getByText('2화 · 둘째화'), screen.getByText('1화 · 첫화'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
