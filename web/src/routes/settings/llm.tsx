import { LlmScreen } from '@/features/settings/components/llm-screen';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/llm')({
  component: LlmScreen,
});
