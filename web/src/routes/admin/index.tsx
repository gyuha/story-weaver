import { AccountApprovalScreen } from '@/features/admin/components/account-approval-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/')({
  component: AccountApprovalScreen,
});
