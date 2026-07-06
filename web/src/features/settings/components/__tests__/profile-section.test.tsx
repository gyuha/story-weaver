import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateProfile = vi.fn();
vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: { updateProfile: (...args: unknown[]) => mockUpdateProfile(...args) },
}));

const mockSetUser = vi.fn();
vi.mock('@/features/auth/store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: unknown; setUser: () => void }) => unknown) =>
    selector({
      user: {
        id: 'u1',
        email: 'writer@example.com',
        display_name: '백야',
        avatar_emoji: '🖋️',
        theme: 'system',
      },
      setUser: mockSetUser,
    }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { ProfileSection } from '../account-screen';

describe('ProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the profile via authApi and updates the auth store', async () => {
    const updated = {
      id: 'u1',
      email: 'writer@example.com',
      display_name: '새이름',
      avatar_emoji: '✍️',
      theme: 'system',
    };
    mockUpdateProfile.mockResolvedValue(updated);
    const user = userEvent.setup();
    render(<ProfileSection />);

    await user.clear(screen.getByLabelText('표시 이름'));
    await user.type(screen.getByLabelText('표시 이름'), '새이름');
    await user.clear(screen.getByLabelText('아바타 이모지'));
    await user.type(screen.getByLabelText('아바타 이모지'), '✍️');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        body: { display_name: '새이름', avatar_emoji: '✍️' },
      });
    });
    expect(mockSetUser).toHaveBeenCalledWith(updated);
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows an error toast and does not update the store when saving fails', async () => {
    mockUpdateProfile.mockRejectedValue({
      response: { data: { detail: '서버 오류가 발생했습니다.' } },
    });
    const user = userEvent.setup();
    render(<ProfileSection />);

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('서버 오류가 발생했습니다.');
    });
    expect(mockSetUser).not.toHaveBeenCalled();
  });
});
