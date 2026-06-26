import { requireAuth } from '@/features/auth/lib/guard';
import { Outlet, createFileRoute } from '@tanstack/react-router';

// 레이아웃 라우트 — /bible(목록)과 /bible/new(추가)를 자식으로 둔다
export const Route = createFileRoute('/works/$workId/bible')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/bible`),
  component: Outlet,
});
