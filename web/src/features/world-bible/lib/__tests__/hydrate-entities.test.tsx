import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEntities = vi.fn();
vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    entities: (...args: unknown[]) => mockEntities(...args),
  },
}));

import { fetchWorkEntities, useWorkEntities } from '../hydrate-entities';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const WORK_ID = 'w1';

function makeWork(): Work {
  return {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [makeWork()] });
});

describe('fetchWorkEntities', () => {
  it('서버 EntityResponse[]를 웹 Entity[] 모양으로 매핑한다', async () => {
    mockEntities.mockResolvedValue([
      {
        id: 'en1',
        workId: WORK_ID,
        entityType: 'character',
        name: '이서하',
        aliases: ['서하'],
        summary: '주인공',
        attributes: { appearance: '흑발', sample_lines: ['안녕'] },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const entities = await fetchWorkEntities(WORK_ID);

    expect(entities).toEqual([
      {
        id: 'en1',
        type: '인물',
        name: '이서하',
        emoji: '👤',
        alias: '서하',
        summary: '주인공',
        fields: [{ label: '외모', value: '흑발' }],
        sampleLines: ['안녕'],
      },
    ]);
    expect(mockEntities).toHaveBeenCalledWith({ path: { work_id: WORK_ID } });
  });

  it('별칭·attributes가 없으면 emoji만 유형 기본값으로 채운다', async () => {
    mockEntities.mockResolvedValue([
      {
        id: 'en2',
        workId: WORK_ID,
        entityType: 'location',
        name: '혈산문',
        aliases: [],
        summary: '',
        attributes: {},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const [entity] = await fetchWorkEntities(WORK_ID);

    expect(entity).toEqual({
      id: 'en2',
      type: '장소',
      name: '혈산문',
      emoji: '🏔️',
      summary: '',
      fields: [],
    });
  });
});

describe('useWorkEntities', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockEntities.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWorkEntities(WORK_ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockEntities.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWorkEntities(WORK_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('성공 시 store의 해당 work.entities를 서버 응답으로 교체한다', async () => {
    mockEntities.mockResolvedValue([
      {
        id: 'en1',
        workId: WORK_ID,
        entityType: 'item',
        name: '천뢰검',
        aliases: [],
        summary: '',
        attributes: {},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    renderHook(() => useWorkEntities(WORK_ID), { wrapper });

    await waitFor(() => {
      const work = useWorksStore.getState().works.find((w) => w.id === WORK_ID);
      expect(work?.entities).toEqual([
        { id: 'en1', type: '아이템', name: '천뢰검', emoji: '🗡️', summary: '', fields: [] },
      ]);
    });
  });
});
