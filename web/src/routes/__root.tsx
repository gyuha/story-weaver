import Modals from '@/components/ui/modal/modal-manager';
import { Toaster } from '@/components/ui/sonner';
import { AppProviders } from '@/providers/app-providers';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AppProviders>
      <Outlet />
      <Modals />
      <Toaster />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </AppProviders>
  );
}
