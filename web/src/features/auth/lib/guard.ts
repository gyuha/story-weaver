import { redirect } from '@tanstack/react-router';
import { useAuthStore } from '../store/auth.store';

/** 라우트 beforeLoad에서 호출 — 미인증 시 로그인으로 리다이렉트 */
export function requireAuth(redirectTo: string) {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: '/auth/login', search: { redirect: redirectTo } });
  }
}

/** 라우트 beforeLoad에서 호출 — 인증 + 관리자 권한 필요. 비관리자는 /works로 */
export function requireAdmin(redirectTo: string) {
  requireAuth(redirectTo);
  if (useAuthStore.getState().user?.role !== 'ADMIN') {
    throw redirect({ to: '/works' });
  }
}
