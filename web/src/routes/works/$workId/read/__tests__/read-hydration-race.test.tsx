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
  };
});

// 실제 useWorkChapters(useQuery + setWorkChapters 이펙트)를 그대로 사용하기 위해 API만 mock한다.
const mockEpisodes = vi.fn();
const mockChapters = vi.fn();
const mockScenes = vi.fn();
const mockSceneLinks = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: {
    episodes: (...args: unknown[]) => mockEpisodes(...args),
    chapters: (...args: unknown[]) => mockChapters(...args),
    scenes: (...args: unknown[]) => mockScenes(...args),
  },
}));
vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    sceneLinks: (...args: unknown[]) => mockSceneLinks(...args),
  },
}));

vi.mock('@/features/editor/components/reading-screen', () => ({
  ReadingScreen: () => <div data-testid="reading-screen" />,
}));

import { useWorksStore } from '@/features/shared/store/works.store';
import { ReadPage } from '../$chapterId';
import { ReadIndexPage } from '../index';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const WRITE_TARGET = expect.objectContaining({ to: '/works/$workId/write' });

beforeEach(() => {
  vi.clearAllMocks();
  // 딥링크 새로고침 시나리오: works 목록은 하이드레이션됐지만 chapters는 아직 [].
  useWorksStore.setState({ works: [{ id: 'w1', chapters: [] } as never] });
  mockEpisodes.mockResolvedValue([{ id: 'e1', title: '제1부' }]);
  mockChapters.mockResolvedValue([{ id: 'c1', orderIndex: 1, title: '1화' }]);
  mockScenes.mockResolvedValue([{ id: 's1', title: '새 씬', body: '본문' }]);
  mockSceneLinks.mockResolvedValue([]);
});

// chapters 조회가 막 끝난 커밋에서 setWorkChapters 반영이 리렌더에 실리기 전,
// 교정 이펙트가 렌더 클로저의 work(chapters: [])를 읽고 "챕터 없음 → write"로
// 잘못 내비게이션하는 경합을 재현한다(딥링크 새로고침에서 실브라우저로 관찰된 버그).
describe('read 라우트 — chapters 하이드레이션 경합', () => {
  it('ReadIndexPage: 챕터가 있는 작품에서 write로 튕기지 않고 첫 챕터로 간다', async () => {
    mockUseParams.mockReturnValue({ workId: 'w1' });

    render(<ReadIndexPage />, { wrapper });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/works/$workId/read/$chapterId',
        params: { workId: 'w1', chapterId: 'c1' },
        replace: true,
      });
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(WRITE_TARGET);
  });

  it('ReadPage: 유효한 chapterId 딥링크는 교정 내비게이션 없이 그대로 렌더된다', async () => {
    mockUseParams.mockReturnValue({ workId: 'w1', chapterId: 'c1' });

    render(<ReadPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('reading-screen')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ReadPage: 잘못된 chapterId는 write가 아니라 첫 챕터로 교정된다', async () => {
    mockUseParams.mockReturnValue({ workId: 'w1', chapterId: 'no-such-chapter' });

    render(<ReadPage />, { wrapper });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/works/$workId/read/$chapterId',
        params: { workId: 'w1', chapterId: 'c1' },
        replace: true,
      });
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(WRITE_TARGET);
  });
});
