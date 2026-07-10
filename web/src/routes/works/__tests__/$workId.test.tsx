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
    Outlet: () => <div data-testid="outlet" />,
  };
});

const mockUseHydrateWorks = vi.fn();
vi.mock('@/features/works/lib/hydrate-works', () => ({
  useHydrateWorks: () => mockUseHydrateWorks(),
}));

// NOTE: selectors는 mock하지 않는다 — WorkLayout이 리다이렉트 판단에 실제 스토어를
// 직접 읽으므로(하이드레이션 경합 회피), 실제 useWorksStore 상태로 시나리오를 구성한다.
import { useWorksStore } from '@/features/shared/store/works.store';
import { WorkLayout } from '../$workId';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ workId: 'w1' });
  useWorksStore.setState({ works: [] });
});

describe('WorkLayout', () => {
  it('work이 있으면 Outlet을 렌더한다', () => {
    useWorksStore.setState({ works: [{ id: 'w1' } as never] });
    mockUseHydrateWorks.mockReturnValue({ isPending: false, isError: false });

    render(<WorkLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('work이 없고 로딩 중이면 로딩 스켈레톤을 보여준다', () => {
    mockUseHydrateWorks.mockReturnValue({ isPending: true, isError: false });

    render(<WorkLayout />);

    expect(screen.getByLabelText('작품을 불러오는 중')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('work이 없고 조회가 실패하면 에러 얼럿을 보여준다', () => {
    mockUseHydrateWorks.mockReturnValue({ isPending: false, isError: true });

    render(<WorkLayout />);

    expect(screen.getByText('작품 정보를 불러오지 못했습니다')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('work이 없고 조회가 성공적으로 끝났으면 /works로 리다이렉트한다', () => {
    mockUseHydrateWorks.mockReturnValue({ isPending: false, isError: false });

    const { container } = render(<WorkLayout />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/works', replace: true });
    expect(container).toBeEmptyDOMElement();
  });
});
