import { AdminShell } from '@/features/admin/components/admin-shell';
import { requireAdmin } from '@/features/auth/lib/guard';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/admin')({
  beforeLoad: () => requireAdmin('/admin'),
  component: AdminShell,
});
