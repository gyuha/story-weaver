import { useAuthStore } from '@/features/auth/store/auth.store';
import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    useNavigate: () => vi.fn(),
    Link: ({
      to,
      children,
      className,
    }: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});

const mockList = vi.fn();
vi.mock('@/features/works/api/works.api', () => ({
  worksQueries: {
    list: () => ({ queryKey: ['works-test'], queryFn: mockList }),
  },
}));

import { DashboardScreen } from '../dashboard-screen';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardScreen />
    </QueryClientProvider>
  );
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
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
});

describe('DashboardScreen', () => {
  it('renders a loading state while the query is pending', () => {
    mockList.mockImplementation(() => new Promise(() => {}));
    renderScreen();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error banner when the query fails', async () => {
    mockList.mockRejectedValue(new Error('network error'));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders without a resume card when the work list is empty', async () => {
    mockList.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('이어서 쓰기')).not.toBeInTheDocument();
    expect(screen.getByText('새 작품 만들기')).toBeInTheDocument();
  });

  it('renders the card grid for a populated work list', async () => {
    mockList.mockResolvedValue([WORK_RESPONSE]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('이어서 쓰기')).toBeInTheDocument();
    });
    expect(screen.getAllByText('천뢰검전').length).toBeGreaterThan(0);
  });
});
