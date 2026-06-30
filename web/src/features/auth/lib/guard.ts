import { redirect } from '@tanstack/react-router';
import { useAuthStore } from '../store/auth.store';

/** 라우트 beforeLoad에서 호출 — 미인증 시 로그인으로 리다이렉트 */
export function requireAuth(redirectTo: string) {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: '/auth/login', search: { redirect: redirectTo } });
  }
}

/**
 * 라우트 beforeLoad에서 호출 — 인증 필요.
 * NOTE: role 정보가 UserResponse에 없으므로 requireAuth와 동일하게 동작.
 * 서버측 권한 검사로 보호된다.
 */
export function requireAdmin(redirectTo: string) {
  requireAuth(redirectTo);
}
