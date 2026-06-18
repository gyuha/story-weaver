import { requireAuth } from '@/features/auth/lib/guard';
import { DashboardScreen } from '@/features/works/components/dashboard-screen';
import { NewWorkModal } from '@/features/works/components/new-work-modal';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/works/new')({
  beforeLoad: () => requireAuth('/works/new'),
  component: NewWorkRoute,
});

function NewWorkRoute() {
  return (
    <>
      <DashboardScreen />
      <NewWorkModal />
    </>
  );
}
