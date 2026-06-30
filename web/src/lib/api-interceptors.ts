import type { TokenResponse } from '@/api';
import { client } from '@/api/client.gen';
import { getAccessToken, getRefreshToken, useAuthStore } from '@/features/auth/store/auth.store';

type RefreshFn = () => Promise<TokenResponse>;

/**
 * 단일-비행(single-flight) 갱신 코디네이터.
 * 동시에 여러 401이 들어와도 refresh 호출은 한 번만 발생한다.
 * 테스트를 위해 export — 앱 코드에서 직접 import 금지.
 */
export function createRefreshCoordinator(refreshFn: RefreshFn) {
  let inflight: Promise<string> | null = null;

  return {
    async refresh(): Promise<string> {
      if (!inflight) {
        inflight = refreshFn()
          .then((tokens) => {
            useAuthStore.getState().setSession(tokens);
            return tokens.access_token;
          })
          .catch((err) => {
            useAuthStore.getState().clear();
            throw err;
          })
          .finally(() => {
            inflight = null;
          });
      }
      return inflight;
    },
  };
}

// ── 앱 레벨 코디네이터 인스턴스 ──────────────────────────────────────────────
const coordinator = createRefreshCoordinator(() => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    useAuthStore.getState().clear();
    return Promise.reject(new Error('no refresh token'));
  }
  // 순환 의존 방지: 런타임 import (authApi.refresh는 client를 사용하므로
  // 인터셉터 바깥에서 생성된 coordinator가 interceptor에 걸리지 않도록 throwOnError 없이 직접 호출)
  return import('@/features/auth/api/auth.api').then(({ authApi }) =>
    authApi.refresh({ body: { refresh_token: refreshToken } })
  );
});

// ── Request 인터셉터: Authorization 헤더 주입 ────────────────────────────────
client.instance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response 인터셉터: 401 → single-flight refresh → 재시도 ──────────────────
const RETRIED = '__sw_retried';
const REFRESH_URL = '/api/v1/auth/refresh';

// 공개 auth 엔드포인트 — 4xx(잘못된 자격증명·검증 실패·미인증)가 정상 응답이므로
// 토큰 refresh/리다이렉트 대상이 아니다. 오류를 그대로 호출자(페이지)에 전파해
// 화면에서 사유를 표시하게 한다. (refresh 엔드포인트는 자체 처리하므로 제외)
export const PUBLIC_AUTH_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/password-reset',
  '/api/v1/auth/verify-email',
];
export const isPublicAuthError = (url: string | undefined): boolean =>
  !!url && PUBLIC_AUTH_PATHS.some((p) => url.includes(p));

client.instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;

    // 공개 auth 엔드포인트(login/signup/password-reset/verify-email)의 오류는
    // refresh/리다이렉트 없이 그대로 전파 — 화면이 리로드되지 않고 사유를 표시한다.
    if (isPublicAuthError(config?.url)) {
      return Promise.reject(error);
    }

    // refresh 엔드포인트 자체가 401이면 세션 초기화 후 로그인으로 (무한루프 방지)
    if (status === 401 && config?.url?.includes(REFRESH_URL)) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    // refresh 실패 or 이미 재시도한 요청의 401 → 세션 초기화 후 로그인으로
    if (status === 401 && config?.[RETRIED]) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    if (status === 401 && config) {
      config[RETRIED] = true;
      try {
        const newToken = await coordinator.refresh();
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return client.instance.request(config);
      } catch {
        window.location.href = '/auth/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
