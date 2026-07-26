import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GenreSelect } from '../genre-select';

// eco: jsdom doesn't implement scrollIntoView/ResizeObserver, which cmdk relies on.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

const ITEMS = [
  { value: '무협', emoji: '⚔️' },
  { value: '로맨스 판타지', emoji: '🌹' },
  { value: '정통 판타지', emoji: '🐉' },
];

function setup() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

describe('GenreSelect', () => {
  it('filters the list as the user types in the search input', async () => {
    const user = setup();
    render(<GenreSelect items={ITEMS} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('무협')).toBeInTheDocument();
    expect(screen.getByText('로맨스 판타지')).toBeInTheDocument();
    expect(screen.getByText('정통 판타지')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('장르 검색...'), '로맨스');

    expect(screen.getByText('로맨스 판타지')).toBeInTheDocument();
    expect(screen.queryByText('무협')).not.toBeInTheDocument();
    expect(screen.queryByText('정통 판타지')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches the search', async () => {
    const user = setup();
    render(<GenreSelect items={ITEMS} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('장르 검색...'), '존재하지않는장르');

    expect(screen.getByText('장르를 찾을 수 없습니다')).toBeInTheDocument();
  });

  it('calls onChange with the selected value and reflects it on the trigger when re-rendered', async () => {
    const user = setup();
    const handleChange = vi.fn();
    const { rerender } = render(<GenreSelect items={ITEMS} value={null} onChange={handleChange} />);

    expect(screen.getByText('장르를 검색하거나 선택하세요')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('로맨스 판타지'));

    expect(handleChange).toHaveBeenCalledWith('로맨스 판타지');

    rerender(<GenreSelect items={ITEMS} value="로맨스 판타지" onChange={handleChange} />);

    expect(screen.getByRole('button')).toHaveTextContent('로맨스 판타지');
  });
});
