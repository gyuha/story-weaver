import type { TokenResponse, UserResponse } from '@/api';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserResponse | null;
  /** 파생값: !!accessToken */
  isAuthenticated: boolean;
  setSession: (tokens: TokenResponse) => void;
  setUser: (user: UserResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setSession: ({ access_token, refresh_token }) =>
        set({ accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      clear: () =>
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false }),
    }),
    { name: 'sw-auth-v3' }
  )
);

/** 인터셉터용 논훅 getter */
export const getAccessToken = () => useAuthStore.getState().accessToken;
export const getRefreshToken = () => useAuthStore.getState().refreshToken;
