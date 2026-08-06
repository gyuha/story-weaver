import { requireAuth } from '@/features/auth/lib/guard';
import { VersionsPage } from '@/features/editor/components/versions-page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/versions/$chapterId')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/versions/${params.chapterId}`),
  component: VersionsPage,
});
