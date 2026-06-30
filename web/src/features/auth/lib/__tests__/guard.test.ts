import { redirect } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/auth.store';
import { requireAdmin, requireAuth } from '../guard';

vi.mock('@tanstack/react-router', () => ({
  redirect: vi.fn((opts) => {
    // TanStack Router throws the redirect object; replicate that here
    throw opts;
  }),
}));

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
});

describe('requireAuth', () => {
  it('throws redirect to /auth/login when not authenticated', () => {
    expect(() => requireAuth('/protected')).toThrow();
    expect(redirect).toHaveBeenCalledWith({
      to: '/auth/login',
      search: { redirect: '/protected' },
    });
  });

  it('does not throw when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });
    expect(() => requireAuth('/protected')).not.toThrow();
  });
});

describe('requireAdmin', () => {
  it('throws redirect when not authenticated (falls back to requireAuth)', () => {
    expect(() => requireAdmin('/admin')).toThrow();
    expect(redirect).toHaveBeenCalledWith({
      to: '/auth/login',
      search: { redirect: '/admin' },
    });
  });

  it('does not throw when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });
    expect(() => requireAdmin('/admin')).not.toThrow();
  });
});
