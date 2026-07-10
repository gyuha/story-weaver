import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
vi.mock('@/features/works/api/works.api', () => ({
  worksQueries: {
    list: () => ({ queryKey: ['works-test'], queryFn: mockList }),
  },
}));

import { useHydrateWorks } from '../hydrate-works';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const WORK_RESPONSE = {
  id: 'w1',
  title: '천뢰검전',
  shortLabel: '천',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  status: '연재 중',
  coverTheme: 'dark' as const,
  stats: { chapters: 12, words: '3.2', wordsUnit: '만자', characters: 4, progress: 40 },
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
  lastEditedLabel: '2시간 전',
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [] });
});

describe('useHydrateWorks', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockList.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useHydrateWorks(), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockList.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useHydrateWorks(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('목록 응답이 도착하면 store의 works를 채운다(nested 배열은 빈 배열로 시작)', async () => {
    mockList.mockResolvedValue([WORK_RESPONSE]);

    renderHook(() => useHydrateWorks(), { wrapper });

    await waitFor(() => {
      const { works } = useWorksStore.getState();
      expect(works).toEqual([
        { ...WORK_RESPONSE, chapters: [], entities: [], timeline: [], conflicts: [] },
      ]);
    });
  });
});
