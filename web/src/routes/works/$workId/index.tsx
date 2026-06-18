import { requireAuth } from '@/features/auth/lib/guard';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/')({
  beforeLoad: ({ params }) => {
    requireAuth(`/works/${params.workId}`);
    throw redirect({ to: '/works/$workId/write', params });
  },
});
