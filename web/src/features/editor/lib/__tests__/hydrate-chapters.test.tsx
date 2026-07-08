import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEpisodes = vi.fn();
const mockChapters = vi.fn();
const mockScenes = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: {
    episodes: (...args: unknown[]) => mockEpisodes(...args),
    chapters: (...args: unknown[]) => mockChapters(...args),
    scenes: (...args: unknown[]) => mockScenes(...args),
  },
}));

import { fetchWorkChapters, useWorkChapters } from '../hydrate-chapters';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const WORK_ID = 'w1';

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({
    works: [
      {
        id: WORK_ID,
        title: '천뢰검전',
        shortLabel: '천',
        genre: '무협',
        subGenre: '회귀',
        keywords: [],
        style: '간결체',
        status: '연재 중',
        coverTheme: 'dark',
        stats: { chapters: 0, words: '0', wordsUnit: '만자', characters: 0, progress: 0 },
        lastEditedLabel: '방금',
        chapters: [],
        entities: [],
        timeline: [],
        conflicts: [],
        reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
      },
    ],
  });
});

describe('fetchWorkChapters', () => {
  it('부→화→씬을 조회해 웹 Chapter[] 모양으로 조립한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      { id: 'ch1', workId: WORK_ID, episodeId: 'ep1', title: '1화', orderIndex: 1 },
    ]);
    mockScenes.mockResolvedValue([
      {
        id: 'sc1',
        workId: WORK_ID,
        chapterId: 'ch1',
        orderIndex: 1,
        globalSeq: 1,
        title: null,
        body: '첫 문단\n둘째 문단',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const chapters = await fetchWorkChapters(WORK_ID);

    expect(chapters).toEqual([
      {
        id: 'ch1',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 1,
        title: '1화',
        scenes: [
          {
            id: 'sc1',
            title: '새 씬',
            status: 'draft',
            paragraphs: [{ text: '첫 문단' }, { text: '둘째 문단' }],
            linkedEntityIds: [],
            vectorMemory: [],
          },
        ],
      },
    ]);
    expect(mockEpisodes).toHaveBeenCalledWith({ path: { work_id: WORK_ID } });
    expect(mockChapters).toHaveBeenCalledWith({ path: { work_id: WORK_ID, episode_id: 'ep1' } });
    expect(mockScenes).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1', chapter_id: 'ch1' },
    });
  });

  it('본문이 빈 씬은 status: empty로 매핑한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      { id: 'ch1', workId: WORK_ID, episodeId: 'ep1', title: '1화', orderIndex: 1 },
    ]);
    mockScenes.mockResolvedValue([
      {
        id: 'sc1',
        workId: WORK_ID,
        chapterId: 'ch1',
        orderIndex: 1,
        globalSeq: 1,
        title: null,
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const [chapter] = await fetchWorkChapters(WORK_ID);

    expect(chapter.scenes[0]).toMatchObject({ status: 'empty', paragraphs: [] });
  });
});

describe('useWorkChapters', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockEpisodes.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockEpisodes.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('성공 시 store의 해당 work.chapters를 서버 응답으로 교체한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      { id: 'ch1', workId: WORK_ID, episodeId: 'ep1', title: '1화', orderIndex: 1 },
    ]);
    mockScenes.mockResolvedValue([]);

    renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    await waitFor(() => {
      const work = useWorksStore.getState().works.find((w) => w.id === WORK_ID);
      expect(work?.chapters).toEqual([
        { id: 'ch1', episodeId: 'ep1', partLabel: '제1부', index: 1, title: '1화', scenes: [] },
      ]);
    });
  });
});
