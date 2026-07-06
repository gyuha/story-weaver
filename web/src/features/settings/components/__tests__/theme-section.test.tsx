import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateProfile = vi.fn();
vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: { updateProfile: (...args: unknown[]) => mockUpdateProfile(...args) },
}));

import { ThemeSection } from '../account-screen';

// jsdom은 matchMedia를 구현하지 않는다 — useTheme()의 'system' 분기가 이를 호출한다.
window.matchMedia =
  window.matchMedia ||
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

describe('ThemeSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('applies the theme immediately and persists it to the server', async () => {
    mockUpdateProfile.mockResolvedValue({ theme: 'dark' });
    const user = userEvent.setup();
    render(<ThemeSection />);

    await user.click(screen.getByRole('button', { name: '다크' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ body: { theme: 'dark' } });
    });
  });

  it('keeps the local theme applied even when the server save fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(<ThemeSection />);

    await user.click(screen.getByRole('button', { name: '다크' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
  });
});
