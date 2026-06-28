import { AdminStatsScreen } from '@/features/admin/components/admin-stats-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/stats')({
  component: AdminStatsScreen,
});
