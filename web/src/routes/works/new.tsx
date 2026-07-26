import { requireAuth } from '@/features/auth/lib/guard';
import { NewWorkScreen } from '@/features/works/components/new-work-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/works/new')({
  beforeLoad: () => requireAuth('/works/new'),
  component: NewWorkScreen,
});
