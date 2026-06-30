import { useAuthStore } from '@/features/auth/store/auth.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

const mockLogin = vi.fn();
const mockMe = vi.fn();

vi.mock('@/features/auth/api/auth.api', () => ({
  authApi: {
    login: (...args: unknown[]) => mockLogin(...args),
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

// --- helpers ---

const TOKENS = {
  access_token: 'acc-test',
  refresh_token: 'ref-test',
  token_type: 'bearer' as const,
  expires_in: 3600,
};

const USER = {
  id: 'u1',
  email: 'writer@example.com',
  display_name: '작가',
  is_verified: true,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/이메일/), email);
  await userEvent.type(screen.getByLabelText(/비밀번호/), password);
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
}

// --- setup ---

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
});

// --- tests ---

describe('LoginPage', () => {
  it('valid submit calls authApi.login then navigates to /works', async () => {
    mockLogin.mockResolvedValue(TOKENS);
    mockMe.mockResolvedValue(USER);

    const { LoginPage } = await import('../login-page');
    render(<LoginPage />);

    await fillAndSubmit('writer@example.com', 'pass1234');

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        body: { email: 'writer@example.com', password: 'pass1234' },
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/works' });
    });
  });

  it('navigates to the redirect prop when provided', async () => {
    mockLogin.mockResolvedValue(TOKENS);
    mockMe.mockResolvedValue(USER);

    const { LoginPage } = await import('../login-page');
    render(<LoginPage redirect="/dashboard" />);

    await fillAndSubmit('writer@example.com', 'pass1234');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });
  });

  it('shows the credential message for an invalid-credentials 401', async () => {
    mockLogin.mockRejectedValue({
      response: { status: 401, data: { detail: 'Invalid email or password.' } },
    });

    const { LoginPage } = await import('../login-page');
    render(<LoginPage />);

    await fillAndSubmit('bad@example.com', 'wrong');

    await waitFor(() => {
      expect(screen.getByText('이메일 또는 비밀번호를 확인해주세요.')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a clear reason when email verification is required (also a 401)', async () => {
    mockLogin.mockRejectedValue({
      response: { status: 401, data: { detail: 'Email verification is required before login.' } },
    });

    const { LoginPage } = await import('../login-page');
    render(<LoginPage />);

    await fillAndSubmit('unverified@example.com', 'pass1234');

    await waitFor(() => {
      expect(
        screen.getByText('이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해 주세요.')
      ).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to the backend detail for an unmapped failure', async () => {
    mockLogin.mockRejectedValue({
      response: { status: 403, data: { detail: '계정이 정지되었습니다.' } },
    });

    const { LoginPage } = await import('../login-page');
    render(<LoginPage />);

    await fillAndSubmit('writer@example.com', 'pass1234');

    await waitFor(() => {
      expect(screen.getByText('계정이 정지되었습니다.')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('button shows loading state during submission', async () => {
    let resolve: (v: typeof TOKENS) => void = () => {};
    mockLogin.mockImplementation(
      () =>
        new Promise<typeof TOKENS>((res) => {
          resolve = res;
        })
    );
    mockMe.mockResolvedValue(USER);

    const { LoginPage } = await import('../login-page');
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/이메일/), 'writer@example.com');
    await userEvent.type(screen.getByLabelText(/비밀번호/), 'pass1234');
    await userEvent.click(screen.getByRole('button', { name: /로그인/ }));

    expect(screen.getByRole('button', { name: /로그인 중/ })).toBeDisabled();

    resolve(TOKENS);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
