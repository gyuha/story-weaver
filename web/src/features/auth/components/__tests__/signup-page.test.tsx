import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the router — SignupPage uses useNavigate
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock authApi
vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: {
    signup: vi.fn(),
  },
}));

// Mock sub-components used in AuthLayout / SocialRow to keep test focused
vi.mock('../auth-layout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../auth-form-parts', () => ({
  SocialRow: () => null,
  OrDivider: () => null,
}));

import { authApi } from '@/features/auth/api/auth.api';
import { SignupPage } from '../signup-page';

const fillForm = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
  // Field uses <label><span>…</span><input> — accessible name comes from the span text via label.
  await user.type(screen.getByRole('textbox', { name: '필명' }), '테스터');
  await user.type(screen.getByRole('textbox', { name: '이메일' }), 'test@example.com');
  // password input has type="password" so it's not a textbox role; query directly.
  const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
  await user.type(passwordInput, 'password123');
  await user.click(screen.getByRole('button', { name: /이용약관/ }));
};

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls authApi.signup on valid submit and shows verify-email message — does NOT navigate', async () => {
    vi.mocked(authApi.signup).mockResolvedValue({
      user: {
        id: 'u1',
        email: 'test@example.com',
        display_name: '테스터',
        is_verified: false,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      message: '인증 메일을 보냈습니다',
    });

    const user = userEvent.setup();
    const { container } = render(<SignupPage />);

    await fillForm(user, container);
    await user.click(screen.getByRole('button', { name: /무료로 시작하기/ }));

    await waitFor(() => {
      expect(authApi.signup).toHaveBeenCalledWith({
        body: {
          email: 'test@example.com',
          password: 'password123',
          display_name: '테스터',
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText(/인증 메일을 보냈습니다 — 메일함을 확인해 주세요/)
      ).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/works' });
  });

  it('shows inline error when authApi.signup rejects', async () => {
    vi.mocked(authApi.signup).mockRejectedValue(new Error('network error'));

    const user = userEvent.setup();
    const { container } = render(<SignupPage />);

    await fillForm(user, container);
    await user.click(screen.getByRole('button', { name: /무료로 시작하기/ }));

    await waitFor(() => {
      expect(screen.getByText(/가입 중 오류가 발생했습니다/)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('surfaces the backend validation message from a 422 detail array', async () => {
    vi.mocked(authApi.signup).mockRejectedValue({
      response: {
        data: {
          detail: [
            {
              type: 'value_error',
              loc: ['body', 'password'],
              msg: 'Value error, Password must contain at least one uppercase letter.',
              ctx: { error: 'Password must contain at least one uppercase letter.' },
            },
          ],
        },
      },
    });

    const user = userEvent.setup();
    const { container } = render(<SignupPage />);

    await fillForm(user, container);
    await user.click(screen.getByRole('button', { name: /무료로 시작하기/ }));

    await waitFor(() => {
      expect(
        screen.getByText('Password must contain at least one uppercase letter.')
      ).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
