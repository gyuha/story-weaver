import { redirect } from '@tanstack/react-router';
import { useAuthStore } from '../store/auth.store';

/** 라우트 beforeLoad에서 호출 — 미인증 시 로그인으로 리다이렉트 */
export function requireAuth(redirectTo: string) {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: '/auth/login', search: { redirect: redirectTo } });
  }
}
