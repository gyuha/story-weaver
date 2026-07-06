import type { UserResponse } from '@/api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceMeta } from '../selectors';

function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 'u1',
    email: 'test@example.com',
    display_name: '백야',
    avatar_emoji: null,
    theme: 'system',
    is_verified: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  useAuthStore.setState({ user: null });
});

describe('useWorkspaceMeta', () => {
  it("derives workspaceName/authorInitial from the authenticated user's display_name", () => {
    useAuthStore.setState({ user: makeUser({ display_name: '백야의 서재' }) });

    const { result } = renderHook(() => useWorkspaceMeta());

    expect(result.current.workspaceName).toBe('백야의 서재');
    expect(result.current.authorInitial).toBe('백');
  });

  it('falls back to a sane default when there is no authenticated user', () => {
    const { result } = renderHook(() => useWorkspaceMeta());

    expect(result.current.workspaceName).toBeTruthy();
    expect(result.current.authorInitial).toBe(result.current.workspaceName.charAt(0));
  });
});
