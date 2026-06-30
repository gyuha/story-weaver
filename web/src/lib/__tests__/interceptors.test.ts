import { useAuthStore } from '@/features/auth/store/auth.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRefreshCoordinator, isPublicAuthError } from '../api-interceptors';

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
});

describe('refresh coordinator (single-flight)', () => {
  it('two concurrent 401s call refresh exactly once, both get new token', async () => {
    // Seed a refresh token so coordinator has something to work with
    useAuthStore.getState().setSession({
      access_token: 'old-acc',
      refresh_token: 'ref-tok',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const refreshFn = vi.fn().mockResolvedValue({
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const coordinator = createRefreshCoordinator(refreshFn);

    // Fire two concurrent refresh attempts
    const [r1, r2] = await Promise.all([coordinator.refresh(), coordinator.refresh()]);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(r1).toBe('new-acc');
    expect(r2).toBe('new-acc');
    expect(useAuthStore.getState().accessToken).toBe('new-acc');
  });

  it('refresh failure clears session', async () => {
    useAuthStore.getState().setSession({
      access_token: 'old-acc',
      refresh_token: 'ref-tok',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));
    const coordinator = createRefreshCoordinator(refreshFn);

    await expect(coordinator.refresh()).rejects.toThrow();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('coordinator resets after completion so next call can refresh again', async () => {
    useAuthStore.getState().setSession({
      access_token: 'acc',
      refresh_token: 'ref',
      token_type: 'bearer',
      expires_in: 3600,
    });

    let call = 0;
    const refreshFn = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve({
        access_token: `acc-${call}`,
        refresh_token: `ref-${call}`,
        token_type: 'bearer',
        expires_in: 3600,
      });
    });

    const coordinator = createRefreshCoordinator(refreshFn);

    await coordinator.refresh(); // first refresh cycle
    await coordinator.refresh(); // second refresh cycle (new in-flight)

    expect(refreshFn).toHaveBeenCalledTimes(2);
  });
});

describe('isPublicAuthError (public auth endpoints bypass refresh-retry)', () => {
  it('is true for login/signup/password-reset/verify-email', () => {
    expect(isPublicAuthError('/api/v1/auth/login')).toBe(true);
    expect(isPublicAuthError('/api/v1/auth/signup')).toBe(true);
    expect(isPublicAuthError('/api/v1/auth/password-reset')).toBe(true);
    expect(isPublicAuthError('/api/v1/auth/verify-email/tok123')).toBe(true);
  });

  it('is false for authenticated / refresh-eligible endpoints', () => {
    expect(isPublicAuthError('/api/v1/auth/me')).toBe(false);
    expect(isPublicAuthError('/api/v1/auth/logout')).toBe(false);
    expect(isPublicAuthError('/api/v1/auth/refresh')).toBe(false);
    expect(isPublicAuthError('/api/v1/works')).toBe(false);
    expect(isPublicAuthError(undefined)).toBe(false);
  });
});
