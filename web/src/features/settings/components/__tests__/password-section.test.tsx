import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }));

const mockChangePassword = vi.fn();
vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: { changePassword: (...args: unknown[]) => mockChangePassword(...args) },
}));

const mockClear = vi.fn();
vi.mock('@/features/auth/store/auth.store', () => ({
  useAuthStore: (selector: (s: { clear: () => void }) => unknown) => selector({ clear: mockClear }),
}));

vi.mock('../../store/settings.store', () => ({
  useSettingsStore: (selector: (s: { profile: { provider: string } }) => unknown) =>
    selector({ profile: { provider: 'email' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PasswordSection } from '../account-screen';

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('현재 비밀번호'), 'OldPass1@');
  await user.type(screen.getByLabelText('새 비밀번호'), 'NewPass2@');
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'NewPass2@');
  await user.click(screen.getByRole('button', { name: /비밀번호 변경/ }));
}

describe('PasswordSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('changes password, clears session, and navigates to login on success', async () => {
    mockChangePassword.mockResolvedValue({ message: 'Password changed.' });
    const user = userEvent.setup();
    render(<PasswordSection />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        body: { current_password: 'OldPass1@', new_password: 'NewPass2@' },
      });
    });
    await waitFor(() => expect(mockClear).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/auth/login' });
  });

  it('shows the backend error and does not navigate on failure', async () => {
    mockChangePassword.mockRejectedValue({
      response: { data: { detail: 'Current password is incorrect.' } },
    });
    const user = userEvent.setup();
    render(<PasswordSection />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });
});
