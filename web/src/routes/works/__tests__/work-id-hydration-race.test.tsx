import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseParams = vi.fn();
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
    Outlet: () => <div data-testid="outlet" />,
  };
});

const mockList = vi.fn();
vi.mock('@/features/works/api/works.api', () => ({
  worksQueries: {
    list: () => ({ queryKey: ['works-race-test'], queryFn: mockList }),
  },
}));

import { WorkLayout } from '../$workId';

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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [] });
  mockUseParams.mockReturnValue({ workId: 'w1' });
});

// 실제 useHydrateWorks + useWorksStore를 그대로 사용해, 목록 조회가 막 끝난 렌더에서
// 스토어 반영이 한 틱 늦어 work가 아직 undefined인 순간을 재현한다(딥링크 새로고침 시나리오).
describe('WorkLayout — 하이드레이션 경합', () => {
  it('목록 조회가 막 끝난 시점에도 /works로 잘못 리다이렉트하지 않고 Outlet을 렌더한다', async () => {
    mockList.mockResolvedValue([WORK_RESPONSE]);

    render(<WorkLayout />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
