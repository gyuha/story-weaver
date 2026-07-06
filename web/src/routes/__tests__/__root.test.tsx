import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMe = vi.fn();
vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: { me: (...args: unknown[]) => mockMe(...args) },
}));

const mockApplyTheme = vi.fn();
vi.mock('@/hooks/use-theme', () => ({
  applyTheme: (...args: unknown[]) => mockApplyTheme(...args),
}));

const mockSetUser = vi.fn();
const mockClear = vi.fn();
vi.mock('@/features/auth/store/auth.store', () => ({
  useAuthStore: (selector: (s: { setUser: () => void; clear: () => void }) => unknown) =>
    selector({ setUser: mockSetUser, clear: mockClear }),
  getAccessToken: () => 'token-abc',
}));

import { SessionRestore } from '../__root';

describe('SessionRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores the user and applies their saved theme', async () => {
    mockMe.mockResolvedValue({ id: 'u1', theme: 'dark' });
    render(<SessionRestore />);

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({ id: 'u1', theme: 'dark' });
    });
    expect(mockApplyTheme).toHaveBeenCalledWith('dark');
  });
});
