import { AccountScreen } from '@/features/settings/components/account-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/account')({
  component: AccountScreen,
});
