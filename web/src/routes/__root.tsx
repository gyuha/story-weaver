import { ThemeToggle } from '@/components/theme-toggle';
import Modals from '@/components/ui/modal/modal-manager';
import { Toaster } from '@/components/ui/sonner';
import { HdToastHost } from '@/features/helpdesk/components/ui/hd-toast';
import { AppProviders } from '@/providers/app-providers';
import { isSamplePath } from '@/sample/layout/navigation';
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <AppProviders>
      {isSamplePath(pathname) ? null : <ThemeToggle className="fixed top-4 right-4 z-50" />}
      <Outlet />
      <Modals />
      <Toaster />
      <HdToastHost />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </AppProviders>
  );
}
