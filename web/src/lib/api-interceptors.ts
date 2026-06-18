import { client } from '@/api/client.gen';
import { useAuthStore } from '@/features/auth/store/auth.store';

// 요청 인터셉터: Authorization 헤더 주입
// 401 응답 인터셉터 (토큰 갱신)는 Phase 3에서 구현 예정
client.instance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});
