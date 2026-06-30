import type { CreateClientConfig } from '@/api/client.gen';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  // dev: 빈 baseURL → SDK 경로(/api/v1/...)를 상대로 요청 → vite 프록시가 :8000으로 전달.
  // prod: VITE_API_BASE_URL(API 오리진)로 주입.
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
});
