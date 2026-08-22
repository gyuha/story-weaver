import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchWorkChapters = vi.fn();
vi.mock('@/features/editor/lib/hydrate-chapters', () => ({
  fetchWorkChapters: (...args: unknown[]) => mockFetchWorkChapters(...args),
}));

const mockEntities = vi.fn();
const mockTimelineStates = vi.fn();
vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    entities: (...args: unknown[]) => mockEntities(...args),
    timelineStates: (...args: unknown[]) => mockTimelineStates(...args),
  },
}));

import { fetchWorkTimeline, useWorkTimelineStates } from '../hydrate-timeline';

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
        styleNote: null,
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

describe('fetchWorkTimeline', () => {
  it('엔티티별 타임라인 상태를 조회해 웹 TimelineState[] 모양으로 조립한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([
      {
        id: 'ch1',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 6,
        title: '6화',
      },
    ]);
    mockEntities.mockResolvedValue([
      {
        id: 'en1',
        workId: WORK_ID,
        entityType: 'character',
        name: '이서하',
        aliases: [],
        summary: '',
        attributes: {},
      },
    ]);
    mockTimelineStates.mockResolvedValue([
      {
        id: 'ts1',
        workId: WORK_ID,
        entityId: 'en1',
        chapterId: 'ch1',
        stateKey: 'power_level',
        stateValue: '천뢰검 1식',
        note: null,
        source: 'author',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const timeline = await fetchWorkTimeline(WORK_ID);

    expect(timeline).toEqual([
      {
        id: 'ts1',
        entityId: 'en1',
        entityName: '이서하',
        chapterRef: '6화',
        chapterIndex: 6,
        key: 'power_level',
        value: '천뢰검 1식',
        source: 'author',
      },
    ]);
    expect(mockEntities).toHaveBeenCalledWith({ path: { work_id: WORK_ID } });
    expect(mockTimelineStates).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, entity_id: 'en1' },
    });
  });

  it('ai_suggested 출처는 source: ai로 매핑한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockEntities.mockResolvedValue([
      {
        id: 'en1',
        workId: WORK_ID,
        entityType: 'character',
        name: '이서하',
        aliases: [],
        summary: '',
        attributes: {},
      },
    ]);
    mockTimelineStates.mockResolvedValue([
      {
        id: 'ts1',
        workId: WORK_ID,
        entityId: 'en1',
        chapterId: 'ch-unknown',
        stateKey: 'status',
        stateValue: 'dead',
        note: null,
        source: 'ai_suggested',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const [state] = await fetchWorkTimeline(WORK_ID);

    expect(state.source).toBe('ai');
    expect(state.chapterRef).toBe('');
  });
});

describe('useWorkTimelineStates', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockEntities.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWorkTimelineStates(WORK_ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockEntities.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWorkTimelineStates(WORK_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('성공 시 store의 해당 work.timeline을 서버 응답으로 교체한다', async () => {
    mockFetchWorkChapters.mockResolvedValue([]);
    mockEntities.mockResolvedValue([
      {
        id: 'en1',
        workId: WORK_ID,
        entityType: 'character',
        name: '이서하',
        aliases: [],
        summary: '',
        attributes: {},
      },
    ]);
    mockTimelineStates.mockResolvedValue([
      {
        id: 'ts1',
        workId: WORK_ID,
        entityId: 'en1',
        chapterId: 'ch-unknown',
        stateKey: 'status',
        stateValue: 'dead',
        note: null,
        source: 'author',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    renderHook(() => useWorkTimelineStates(WORK_ID), { wrapper });

    await waitFor(() => {
      const work = useWorksStore.getState().works.find((w) => w.id === WORK_ID);
      expect(work?.timeline).toEqual([
        {
          id: 'ts1',
          entityId: 'en1',
          entityName: '이서하',
          chapterRef: '',
          chapterIndex: 0,
          key: 'status',
          value: 'dead',
          source: 'author',
        },
      ]);
    });
  });
});
