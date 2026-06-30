import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth.store';

// Reset store + localStorage between tests
beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
});

describe('auth store', () => {
  it('setSession stores tokens and isAuthenticated becomes true', () => {
    useAuthStore.getState().setSession({
      access_token: 'acc-123',
      refresh_token: 'ref-456',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('acc-123');
    expect(state.refreshToken).toBe('ref-456');
    expect(state.isAuthenticated).toBe(true);
  });

  it('clear() resets state and isAuthenticated becomes false', () => {
    useAuthStore.getState().setSession({
      access_token: 'acc-123',
      refresh_token: 'ref-456',
      token_type: 'bearer',
      expires_in: 3600,
    });

    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('localStorage round-trip: tokens survive a store re-hydrate', () => {
    useAuthStore.getState().setSession({
      access_token: 'persisted-acc',
      refresh_token: 'persisted-ref',
      token_type: 'bearer',
      expires_in: 3600,
    });

    // Simulate re-hydrate by reading the raw persisted value
    const raw = localStorage.getItem('sw-auth-v3');
    if (!raw) throw new Error('expected localStorage entry');
    const parsed = JSON.parse(raw);
    expect(parsed.state.accessToken).toBe('persisted-acc');
    expect(parsed.state.refreshToken).toBe('persisted-ref');
  });

  it('isAuthenticated is false when accessToken is null', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('setUser stores user data', () => {
    const user = {
      id: 'u1',
      email: 'test@example.com',
      display_name: '테스터',
      is_verified: true,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
  });
});
