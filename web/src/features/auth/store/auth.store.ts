import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../types/auth';

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
}

// 목업 인증: 작가 백야로 시드 로그인된 상태. URL 직접 진입/새로고침 시 상태 복구가
// 가능하도록 localStorage에 영속화한다. (실제 토큰/세션은 Phase 3에서 도입)
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: true,
      user: { email: 'baekya@storyweaver.kr', role: 'USER' },
      login: (user) => set({ isAuthenticated: true, user }),
      logout: () => set({ isAuthenticated: false, user: null }),
    }),
    { name: 'sw-auth' }
  )
);
