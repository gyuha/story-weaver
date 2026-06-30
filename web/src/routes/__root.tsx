import Modals from '@/components/ui/modal/modal-manager';
import { Toaster } from '@/components/ui/sonner';
import { authApi } from '@/features/auth/api/auth.api';
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { AppProviders } from '@/providers/app-providers';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AppProviders>
      <SessionRestore />
      <Outlet />
      <Modals />
      <Toaster />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </AppProviders>
  );
}

/** 앱 최초 마운트 시 accessToken이 있으면 /me로 사용자 복구 */
function SessionRestore() {
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    // getAccessToken()은 논훅 getter — 반응형 구독이 아니라 일회성 스냅샷 읽기
    if (!getAccessToken()) return;
    authApi.me().then(setUser).catch(clear);
  }, [setUser, clear]);

  return null;
}
