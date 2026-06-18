import { create } from 'zustand'
import type { AuthUser } from '../types/auth'

interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  token: string | null
  refreshToken: string | null
  setTokens: (access: string, refresh: string, email?: string) => void
  setAuth: (user: AuthUser, token: string) => void
  clearUser: () => void
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

// 토큰은 인메모리 상태로만 유지 (localStorage 저장 없음 — XSS 방지)
// persist는 Phase 3에서 httpOnly 쿠키 기반 인증으로 전환 시 재검토
export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: false,
  user: null,
  token: null,
  refreshToken: null,
  // email: 로그인 폼에서 전달 (JWT에 email 없는 경우 sub 폴백)
  setTokens: (access, refresh, email) => {
    const p = decodeJwt(access)
    const user: AuthUser = {
      email: email ?? (p.email as string) ?? (p.sub as string) ?? '',
      role: (p.role as string) === 'ADMIN' ? 'ADMIN' : 'USER',
    }
    set({ isAuthenticated: true, user, token: access, refreshToken: refresh })
  },
  setAuth: (user, token) => set({ isAuthenticated: true, user, token }),
  clearUser: () =>
    set({ isAuthenticated: false, user: null, token: null, refreshToken: null }),
}))
