import { LoginPage } from '@/features/auth/components/login-page';
import { createFileRoute, useSearch } from '@tanstack/react-router';

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = useSearch({ from: '/auth/login' });
  return <LoginPage redirect={redirect} />;
}
