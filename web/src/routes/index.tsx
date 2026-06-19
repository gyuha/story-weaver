import { LandingScreen } from '@/features/landing/components/landing-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingScreen,
});
