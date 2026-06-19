import { requireAuth } from '@/features/auth/lib/guard';
import { SettingsShell } from '@/features/settings/components/settings-shell';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  beforeLoad: () => requireAuth('/settings'),
  component: SettingsShell,
});
