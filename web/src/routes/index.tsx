import { useAuthStore } from '@/features/auth/store/auth.store';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/works' });
    }
    throw redirect({ to: '/auth/login', search: { redirect: '/works' } });
  },
});
