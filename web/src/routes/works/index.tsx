import { DashboardScreen } from '@/features/works/components/dashboard-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/works/')({
  component: DashboardScreen,
});
