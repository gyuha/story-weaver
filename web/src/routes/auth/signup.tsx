import { SignupPage } from '@/features/auth/components/signup-page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/signup')({
  component: SignupPage,
});
