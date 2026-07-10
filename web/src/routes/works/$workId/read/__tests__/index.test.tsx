import { render, screen } from '@testing-library/react';
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

const mockUseWorkChapters = vi.fn();
vi.mock('@/features/editor/lib/hydrate-chapters', () => ({
  useWorkChapters: (...args: unknown[]) => mockUseWorkChapters(...args),
}));

// NOTE: selectors는 mock하지 않는다 — 실제 useWorksStore 상태로 시나리오를 구성한다.
import { useWorksStore } from '@/features/shared/store/works.store';
import { ReadIndexPage } from '../index';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ workId: 'w1' });
  useWorksStore.setState({ works: [] });
});

describe('ReadIndexPage', () => {
  it('로딩 중이면 스켈레톤을 보여주고 내비게이션하지 않는다', () => {
    useWorksStore.setState({ works: [{ id: 'w1', chapters: [] } as never] });
    mockUseWorkChapters.mockReturnValue({ isPending: true, isError: false });

    render(<ReadIndexPage />);

    expect(screen.getByLabelText('원고를 불러오는 중')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('조회가 실패하면 에러 얼럿을 보여주고 내비게이션하지 않는다', () => {
    useWorksStore.setState({ works: [{ id: 'w1', chapters: [] } as never] });
    mockUseWorkChapters.mockReturnValue({ isPending: false, isError: true });

    render(<ReadIndexPage />);

    expect(screen.getByText('원고를 불러오지 못했습니다')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('하이드레이션 완료 후 첫 챕터가 있으면 그 챕터로 replace 내비게이션한다', () => {
    useWorksStore.setState({
      works: [{ id: 'w1', chapters: [{ id: 'ch1' }, { id: 'ch2' }] } as never],
    });
    mockUseWorkChapters.mockReturnValue({ isPending: false, isError: false });

    render(<ReadIndexPage />);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/works/$workId/read/$chapterId',
      params: { workId: 'w1', chapterId: 'ch1' },
      replace: true,
    });
  });

  it('챕터가 하나도 없으면 집필 화면으로 replace 내비게이션한다', () => {
    useWorksStore.setState({ works: [{ id: 'w1', chapters: [] } as never] });
    mockUseWorkChapters.mockReturnValue({ isPending: false, isError: false });

    render(<ReadIndexPage />);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/works/$workId/write',
      params: { workId: 'w1' },
      replace: true,
    });
  });
});
