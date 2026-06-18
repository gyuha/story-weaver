import type { CreateClientConfig } from '@/api/client.gen';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});
