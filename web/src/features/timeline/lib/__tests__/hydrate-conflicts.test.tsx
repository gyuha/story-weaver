import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchWorkChapters = vi.fn();
vi.mock('@/features/editor/lib/hydrate-chapters', () => ({
  fetchWorkChapters: (...args: unknown[]) => mockFetchWorkChapters(...args),
}));

const mockList = vi.fn();
vi.mock('@/features/timeline/api/conflicts.api', () => ({
  conflictsApi: { list: (...args: unknown[]) => mockList(...args) },
}));

import { fetchWorkConflicts, useWorkConflicts } from '../hydrate-conflicts';

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

describe('fetchWorkConflicts', () => {
  it('충돌 후보를 조회해 sceneId를 chapterRef로 조립한 웹 Conflict[] 모양으로 매핑한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([
      {
        id: 'ch1',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 3,
        title: '3화',
        scenes: [{ id: 'sc-dead' }],
      },
      {
        id: 'ch2',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 10,
        title: '10화',
        scenes: [{ id: 'sc-alive' }],
      },
    ]);
    mockList.mockResolvedValue([
      {
        entityId: 'en1',
        entityName: '이서하',
        stateKey: 'life_status',
        earlier: {
          id: 'ts1',
          sceneId: 'sc-dead',
          globalSeq: 30,
          stateValue: 'dead',
          createdAt: '2026-01-01T00:00:00Z',
        },
        later: {
          id: 'ts2',
          sceneId: 'sc-alive',
          globalSeq: 100,
          stateValue: 'alive',
          createdAt: '2026-01-02T00:00:00Z',
        },
      },
    ]);

    const conflicts = await fetchWorkConflicts(WORK_ID);

    expect(conflicts).toEqual([
      {
        id: 'ts1_ts2',
        entityId: 'en1',
        entityName: '이서하',
        stateKey: 'life_status',
        earlier: { sceneId: 'sc-dead', chapterRef: '3화 씬1', globalSeq: 30, stateValue: 'dead' },
        later: { sceneId: 'sc-alive', chapterRef: '10화 씬1', globalSeq: 100, stateValue: 'alive' },
      },
    ]);
    expect(mockList).toHaveBeenCalledWith({ path: { work_id: WORK_ID } });
  });

  it('씬 목록에 없는 sceneId는 chapterRef를 빈 문자열로 둔다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockList.mockResolvedValue([
      {
        entityId: 'en1',
        entityName: '이서하',
        stateKey: 'life_status',
        earlier: {
          id: 'ts1',
          sceneId: 'sc-unknown',
          globalSeq: 1,
          stateValue: 'dead',
          createdAt: '2026-01-01T00:00:00Z',
        },
        later: {
          id: 'ts2',
          sceneId: 'sc-unknown-2',
          globalSeq: 2,
          stateValue: 'alive',
          createdAt: '2026-01-02T00:00:00Z',
        },
      },
    ]);

    const [conflict] = await fetchWorkConflicts(WORK_ID);

    expect(conflict.earlier.chapterRef).toBe('');
    expect(conflict.later.chapterRef).toBe('');
  });
});

describe('useWorkConflicts', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockList.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWorkConflicts(WORK_ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockList.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWorkConflicts(WORK_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('성공 시 store의 해당 work.conflicts를 서버 응답으로 교체한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockList.mockResolvedValue([
      {
        entityId: 'en1',
        entityName: '이서하',
        stateKey: 'life_status',
        earlier: {
          id: 'ts1',
          sceneId: 'sc1',
          globalSeq: 1,
          stateValue: 'dead',
          createdAt: '2026-01-01T00:00:00Z',
        },
        later: {
          id: 'ts2',
          sceneId: 'sc2',
          globalSeq: 2,
          stateValue: 'alive',
          createdAt: '2026-01-02T00:00:00Z',
        },
      },
    ]);

    renderHook(() => useWorkConflicts(WORK_ID), { wrapper });

    await waitFor(() => {
      const work = useWorksStore.getState().works.find((w) => w.id === WORK_ID);
      expect(work?.conflicts).toEqual([
        {
          id: 'ts1_ts2',
          entityId: 'en1',
          entityName: '이서하',
          stateKey: 'life_status',
          earlier: { sceneId: 'sc1', chapterRef: '', globalSeq: 1, stateValue: 'dead' },
          later: { sceneId: 'sc2', chapterRef: '', globalSeq: 2, stateValue: 'alive' },
        },
      ]);
    });
  });
});
